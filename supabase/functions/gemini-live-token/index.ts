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
      `- ${m.name}${m.category ? ` (${m.category})` : ""}${m.price != null ? ` — $${m.price}` : ""}${m.description ? `: ${m.description}` : ""}`
    ).join("\n") || "(no menu items uploaded yet)";

    const offersText = (offers ?? []).map((o: any) =>
      `- ${o.title}: ${o.description ?? ""} Reward: ${o.reward}. ${o.required_visits} visits in ${o.window_days} days.`
    ).join("\n") || "(no active offers)";

    const systemInstruction = `You are the friendly AI host for "${restaurant.name}"${restaurant.cuisine ? `, a ${restaurant.cuisine} restaurant` : ""}. Speak warmly and naturally, like a real human host — short, conversational sentences. Greet the guest by welcoming them to ${restaurant.name}. Answer questions about the menu, prices, and offers. Recommend dishes when asked.

ABOUT: ${restaurant.description ?? "(no description)"}

MENU:
${menuText}

CURRENT OFFERS:
${offersText}

If asked something you don't know, say so honestly and suggest they ask a staff member.`;

    // Mint ephemeral token (valid ~30 min, session uses last ~10 min after first connect)
    const now = Date.now();
    const expireTime = new Date(now + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(now + 2 * 60 * 1000).toISOString();

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${GOOGLE_AI_STUDIO_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            uses: 1,
            expireTime,
            newSessionExpireTime,
            liveConnectConstraints: {
              model: "models/gemini-2.5-flash-preview-native-audio-dialog",
              config: {
                responseModalities: ["AUDIO"],
                systemInstruction: { parts: [{ text: systemInstruction }] },
              },
            },
            httpOptions: { apiVersion: "v1alpha" },
          },
        }),
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      console.error("auth_tokens error", res.status, txt);
      return json({ error: `Failed to mint token: ${res.status}` }, 500);
    }
    const data = await res.json();
    return json({
      token: data.name,
      restaurantName: restaurant.name,
    });
  } catch (e: any) {
    console.error("gemini-live-token error", e);
    return json({ error: e?.message ?? "Unknown error" }, 500);
  }
});
