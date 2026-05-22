import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function randomToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ADMIN ONLY: generate / regenerate the NFC token tied to a branch (staff row).
// Owners can no longer mint NFC tokens; they go through the branch request flow.
export const setStaffNfcToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ staffId: z.string().uuid(), regenerate: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: adminRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRow) throw new Error("Admin only — owners request cards from the admin");

    const { data: row, error } = await supabaseAdmin
      .from("restaurant_staff")
      .select("id, nfc_token")
      .eq("id", data.staffId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Staff not found");
    if (row.nfc_token && !data.regenerate) return { token: row.nfc_token };
    const token = randomToken();
    const { error: uErr } = await supabaseAdmin
      .from("restaurant_staff")
      .update({ nfc_token: token })
      .eq("id", data.staffId);
    if (uErr) throw new Error(uErr.message);
    return { token };
  });

// Customer taps branch card → record an attendance visit attributed to that branch
export const stampVisitByNfc = createServerFn({ method: "POST" })
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
      .select("id, restaurant_id, required_visits, window_days, title")
      .eq("id", data.offerId)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!offer || offer.restaurant_id !== data.restaurantId) throw new Error("Offer not found");

    // Don't allow over-stamping past required_visits within the window
    const since = new Date(Date.now() - offer.window_days * 86400000).toISOString();
    const { count: visitCount } = await supabaseAdmin
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("offer_id", offer.id)
      .gte("visited_at", since);
    if ((visitCount ?? 0) >= offer.required_visits) {
      throw new Error("Card already complete — redeem your reward");
    }

    // Insert visit attributed to the branch staff
    const { error: vErr } = await supabaseAdmin.from("visits").insert({
      user_id: userId,
      offer_id: offer.id,
      verified_by: staff.user_id,
    });
    if (vErr) throw new Error(vErr.message);

    return {
      ok: true,
      branch: staff.label ?? "Branch",
      title: offer.title,
      stamped: (visitCount ?? 0) + 1,
      required: offer.required_visits,
    };
  });


// ADMIN ONLY: stamp a test visit without an NFC card, to demo the flow.
export const adminTestStampVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ restaurantId: z.string().uuid(), offerId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: adminRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!adminRow) throw new Error("Admin only");

    const { data: offer, error: oErr } = await supabaseAdmin
      .from("offers")
      .select("id, restaurant_id, required_visits, window_days, title")
      .eq("id", data.offerId)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!offer || offer.restaurant_id !== data.restaurantId) throw new Error("Offer not found");

    const since = new Date(Date.now() - offer.window_days * 86400000).toISOString();
    const { count: visitCount } = await supabaseAdmin
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("offer_id", offer.id)
      .gte("visited_at", since);
    if ((visitCount ?? 0) >= offer.required_visits) {
      throw new Error("Card already complete — redeem your reward");
    }

    const { error: vErr } = await supabaseAdmin.from("visits").insert({
      user_id: userId,
      offer_id: offer.id,
      verified_by: userId,
    });
    if (vErr) throw new Error(vErr.message);

    return {
      ok: true,
      branch: "Admin test",
      title: offer.title,
      stamped: (visitCount ?? 0) + 1,
      required: offer.required_visits,
    };
  });
