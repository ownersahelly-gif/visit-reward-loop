import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function randomToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Owner generates / regenerates the NFC token tied to a branch (staff row)
export const setStaffNfcToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ staffId: z.string().uuid(), regenerate: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: row, error } = await supabaseAdmin
      .from("restaurant_staff")
      .select("id, nfc_token, restaurants(owner_id)")
      .eq("id", data.staffId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    // @ts-ignore relational
    if (!row || row.restaurants?.owner_id !== userId) throw new Error("Not authorized");
    if (row.nfc_token && !data.regenerate) return { token: row.nfc_token };
    const token = randomToken();
    const { error: uErr } = await supabaseAdmin
      .from("restaurant_staff")
      .update({ nfc_token: token })
      .eq("id", data.staffId);
    if (uErr) throw new Error(uErr.message);
    return { token };
  });

// Customer taps branch card → record redemption attributed to that branch
export const redeemByNfc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      restaurantId: z.string().uuid(),
      offerId: z.string().uuid(),
      nfcToken: z.string().min(8).max(128),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Look up staff/branch by NFC token + restaurant
    const { data: staff, error: sErr } = await supabaseAdmin
      .from("restaurant_staff")
      .select("user_id, label, restaurant_id")
      .eq("nfc_token", data.nfcToken)
      .eq("restaurant_id", data.restaurantId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!staff) throw new Error("This card is not registered for this restaurant");

    // Verify offer belongs to the restaurant
    const { data: offer, error: oErr } = await supabaseAdmin
      .from("offers")
      .select("id, restaurant_id, required_visits, window_days, title, reward")
      .eq("id", data.offerId)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!offer || offer.restaurant_id !== data.restaurantId) throw new Error("Offer not found");

    // Verify the customer is actually eligible (has enough visits in window)
    const since = new Date(Date.now() - offer.window_days * 86400000).toISOString();
    const { count: visitCount } = await supabaseAdmin
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("offer_id", offer.id)
      .gte("visited_at", since);
    if ((visitCount ?? 0) < offer.required_visits) {
      throw new Error("Reward not unlocked yet");
    }

    // Insert redemption attributed to the branch staff
    const { error: rErr } = await supabaseAdmin.from("redemptions").insert({
      user_id: userId,
      offer_id: offer.id,
      restaurant_id: data.restaurantId,
      verified_by: staff.user_id,
    });
    if (rErr) throw new Error(rErr.message);

    // Invalidate any open codes for this offer so the dialog auto-closes cleanly
    await supabaseAdmin
      .from("redemption_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("offer_id", offer.id)
      .is("used_at", null);

    return { ok: true, branch: staff.label ?? "Branch", reward: offer.reward, title: offer.title };
  });
