// Mints an ephemeral Gemini Live auth token for browser WebSocket use.
// The Google AI Studio API key never reaches the client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_AI_STUDIO_API_KEY = Deno.env.get("GOOGLE_AI_STUDIO_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { restaurantId } = await req.json();
    if (!restaurantId) return json({ error: "restaurantId required" }, 400);

    // Build a restaurant-aware system instruction so the live model knows context.
    const [{ data: restaurant }, { data: offers }, { data: menu }] = await Promise.all([
      admin.from("restaurants").select("name, cuisine, description").eq("id", restaurantId).maybeSingle(),
      admin.from("offers").select("title, description, reward, required_visits, window_days").eq("restaurant_id", restaurantId).eq("active", true),
      admin.from("menu_items").select("name, description, price, category").eq("restaurant_id", restaurantId).eq("active", true).order("sort_order"),
    ]);

    if (!restaurant) return json({ error: "Restaurant not found" }, 404);

    const menuText = (menu ?? []).map((m: any) =>
      `- ${m.name}${m.category ? ` (${m.category})` : ""}${m.price != null ? ` — ${m.price}` : ""}${m.description ? `: ${m.description}` : ""}`
    ).join("\n") || "(no menu items)";

    const bestsellersText = (menu ?? []).slice(0, 5).map((m: any) => `- ${m.name}`).join("\n") || "(none)";

    const offersText = (offers ?? []).length
      ? `\nCurrent offers:\n${(offers as any[]).map((o) => `- ${o.title}: ${o.reward}`).join("\n")}`
      : "";

    const systemInstruction = `You are a friendly voice assistant for restaurant ${restaurant.name}.
You speak Arabic or English depending on what the customer uses.
If spoken to in Egyptian Arabic dialect, reply in Egyptian Arabic dialect.
Keep answers short and conversational since this is a voice interaction — no bullet points or long lists.
Only answer questions about the menu, prices, bestsellers, and restaurant info.

Menu:
${menuText}

Bestsellers:
${bestsellersText}
${offersText}`;

    return json({
      systemInstruction,
      restaurantName: restaurant.name,
    });
  } catch (e: any) {
    console.error("gemini-live-token error", e);
    return json({ error: e?.message ?? "Unknown error" }, 500);
  }
});

