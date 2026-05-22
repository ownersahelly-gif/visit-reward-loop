// Public AI assistant for restaurant QR-code visitors.
// No auth required — anyone who scans the QR can chat.
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
    const { restaurantId, messages } = await req.json();
    if (!restaurantId || !Array.isArray(messages)) {
      return json({ error: "restaurantId and messages required" }, 400);
    }

    // Load restaurant + active offers + menu
    const [{ data: restaurant }, { data: offers }, { data: menu }] = await Promise.all([
      admin.from("restaurants").select("name, cuisine, description").eq("id", restaurantId).maybeSingle(),
      admin.from("offers").select("title, description, reward, required_visits, window_days").eq("restaurant_id", restaurantId).eq("active", true),
      admin.from("menu_items").select("name, description, price, category, photo_url").eq("restaurant_id", restaurantId).eq("active", true).order("sort_order"),
    ]);

    if (!restaurant) return json({ error: "Restaurant not found" }, 404);

    const menuLines = (menu ?? []).map((m: any) => {
      const parts = [`• ${m.name}`];
      if (m.category) parts.push(`(${m.category})`);
      if (m.price != null) parts.push(`— ${m.price} EGP`);
      if (m.description) parts.push(`— ${m.description}`);
      if (m.photo_url) parts.push(`[photo available]`);
      return parts.join(" ");
    }).join("\n");

    const offerLines = (offers ?? []).map((o: any) =>
      `• ${o.title}: visit ${o.required_visits} times in ${o.window_days} days → ${o.reward}`
    ).join("\n");

    const systemPrompt = `You are a warm, friendly human waiter at "${restaurant.name}"${restaurant.cuisine ? `, a ${restaurant.cuisine} restaurant` : ""}. Speak naturally like a real person, never mention being an AI or assistant. Keep replies short (1-3 sentences) — this is a spoken voice conversation.

${restaurant.description ? `About us: ${restaurant.description}\n` : ""}
${menuLines ? `MENU:\n${menuLines}\n` : "No menu loaded yet.\n"}
${offerLines ? `LOYALTY OFFERS:\n${offerLines}\n` : ""}
When recommending a dish, mention its EXACT name as written in the menu — the app will automatically show its photo. Be enthusiastic and personal. If asked about something not on the menu, politely say it's not available and suggest a similar item.`;

    const geminiMessages = messages
      .filter((m: any) => typeof m?.content === "string" && m.content.trim())
      .map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GOOGLE_AI_STUDIO_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: geminiMessages,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 220,
        },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return json({ error: "Google AI quota reached, please try again in a moment." }, 429);
      if (aiRes.status === 400 || aiRes.status === 401 || aiRes.status === 403) {
        return json({ error: "Google AI Studio key or model access needs checking." }, aiRes.status);
      }
      const t = await aiRes.text();
      console.error("Google AI error", aiRes.status, t);
      return json({ error: "Google AI request failed" }, 500);
    }

    const data = await aiRes.json();
    const reply = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("").trim() || "Sorry, I didn't catch that.";

    // Find referenced menu items by name (case-insensitive substring)
    const photos = (menu ?? [])
      .filter((m: any) => m.photo_url && reply.toLowerCase().includes(m.name.toLowerCase()))
      .map((m: any) => ({ name: m.name, photo_url: m.photo_url }));

    return json({ reply, photos });
  } catch (e: any) {
    console.error("[ai-chat]", e);
    return json({ error: e?.message ?? "Server error" }, 500);
  }
});
