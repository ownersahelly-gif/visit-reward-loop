// Single edge function that dispatches to all backend actions.
// Replaces the TanStack server functions previously in src/lib/*.functions.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function err(message: string, status = 400) {
  return json({ error: message }, status);
}

function randomToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function getCallerUserId(req: Request): Promise<string | null> {
  const authz = req.headers.get("Authorization") ?? "";
  const token = authz.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  // Verify token using the anon client
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

async function assertAdmin(userId: string) {
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admin only");
}

// ============================================================
// Actions
// ============================================================

async function stampVisitByNfc(userId: string, data: any) {
  const { data: staff, error: sErr } = await admin
    .from("restaurant_staff")
    .select("user_id, label, restaurant_id")
    .eq("nfc_token", data.nfcToken)
    .eq("restaurant_id", data.restaurantId)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!staff) throw new Error("This card is not registered for this restaurant");

  const { data: offer, error: oErr } = await admin
    .from("offers")
    .select("id, restaurant_id, required_visits, window_days, title")
    .eq("id", data.offerId)
    .maybeSingle();
  if (oErr) throw new Error(oErr.message);
  if (!offer || offer.restaurant_id !== data.restaurantId) throw new Error("Offer not found");

  const windowCutoff = new Date(Date.now() - offer.window_days * 86400000);
  const { data: lastRed } = await admin
    .from("redemptions")
    .select("redeemed_at")
    .eq("user_id", userId)
    .eq("offer_id", offer.id)
    .order("redeemed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastRedeemedAt = lastRed?.redeemed_at ? new Date(lastRed.redeemed_at) : new Date(0);
  const since = (lastRedeemedAt > windowCutoff ? lastRedeemedAt : windowCutoff).toISOString();
  const { count: visitCount } = await admin
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("offer_id", offer.id)
    .gt("visited_at", since);
  if ((visitCount ?? 0) >= offer.required_visits) {
    throw new Error("Card already complete — redeem your reward");
  }

  const { error: vErr } = await admin.from("visits").insert({
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
}

async function adminTestStampVisit(userId: string, data: any) {
  await assertAdmin(userId);
  const { data: offer, error: oErr } = await admin
    .from("offers")
    .select("id, restaurant_id, required_visits, window_days, title")
    .eq("id", data.offerId)
    .maybeSingle();
  if (oErr) throw new Error(oErr.message);
  if (!offer || offer.restaurant_id !== data.restaurantId) throw new Error("Offer not found");

  const windowCutoff = new Date(Date.now() - offer.window_days * 86400000);
  const { data: lastRed } = await admin
    .from("redemptions")
    .select("redeemed_at")
    .eq("user_id", userId)
    .eq("offer_id", offer.id)
    .order("redeemed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastRedeemedAt = lastRed?.redeemed_at ? new Date(lastRed.redeemed_at) : new Date(0);
  const since = (lastRedeemedAt > windowCutoff ? lastRedeemedAt : windowCutoff).toISOString();
  const { count: visitCount } = await admin
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("offer_id", offer.id)
    .gt("visited_at", since);
  if ((visitCount ?? 0) >= offer.required_visits) {
    throw new Error("Card already complete — redeem your reward");
  }

  const { error: vErr } = await admin.from("visits").insert({
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
}

async function setStaffNfcToken(userId: string, data: any) {
  await assertAdmin(userId);
  const { data: row, error } = await admin
    .from("restaurant_staff")
    .select("id, nfc_token")
    .eq("id", data.staffId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Staff not found");
  if (row.nfc_token && !data.regenerate) return { token: row.nfc_token };
  const token = randomToken();
  const { error: uErr } = await admin
    .from("restaurant_staff")
    .update({ nfc_token: token })
    .eq("id", data.staffId);
  if (uErr) throw new Error(uErr.message);
  return { token };
}

async function addStaffAccount(userId: string, data: any) {
  const { data: restaurant, error: rErr } = await admin
    .from("restaurants")
    .select("id, owner_id")
    .eq("id", data.restaurantId)
    .maybeSingle();
  if (rErr) throw new Error(rErr.message);
  if (!restaurant || restaurant.owner_id !== userId) {
    throw new Error("Not authorized for this restaurant");
  }

  let userIdToLink: string | null = null;
  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing.users.find(
    (u: any) => u.email?.toLowerCase() === data.email.toLowerCase(),
  );
  if (found) {
    userIdToLink = found.id;
  } else {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (cErr) throw new Error(cErr.message);
    userIdToLink = created.user?.id ?? null;
  }
  if (!userIdToLink) throw new Error("Failed to create user");

  const { error: linkErr } = await admin.from("restaurant_staff").insert({
    restaurant_id: data.restaurantId,
    user_id: userIdToLink,
    label: data.label ?? null,
    password: data.password,
  });
  if (linkErr && !linkErr.message.includes("duplicate")) throw new Error(linkErr.message);
  return { ok: true };
}

async function removeStaffAccount(userId: string, data: any) {
  const { data: row } = await admin
    .from("restaurant_staff")
    .select("id, restaurant_id, restaurants(owner_id)")
    .eq("id", data.staffId)
    .maybeSingle();
  // @ts-ignore relational
  if (!row || row.restaurants?.owner_id !== userId) throw new Error("Not authorized");
  const { error } = await admin.from("restaurant_staff").delete().eq("id", data.staffId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function createBranchRequest(userId: string, data: any) {
  const { data: r } = await admin
    .from("restaurants")
    .select("id, owner_id")
    .eq("id", data.restaurantId)
    .maybeSingle();
  if (!r || r.owner_id !== userId) throw new Error("Not authorized");

  if (data.requestType === "new") {
    if (!data.staffEmail || !data.staffPassword || !data.staffFullName) {
      throw new Error("Staff name, email and password are required for a new branch");
    }
  } else if (!data.existingStaffId) {
    throw new Error("Pick an existing branch to reissue");
  }

  const { error, data: inserted } = await admin
    .from("branch_requests")
    .insert({
      restaurant_id: data.restaurantId,
      requested_by: userId,
      request_type: data.requestType,
      branch_label: data.branchLabel,
      staff_email: data.staffEmail ?? null,
      staff_password: data.staffPassword ?? null,
      staff_full_name: data.staffFullName ?? null,
      existing_staff_id: data.existingStaffId ?? null,
      shipping_address: data.shippingAddress,
      notes: data.notes ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: inserted.id };
}

async function listMyBranchRequests(userId: string, data: any) {
  const { data: rows, error } = await admin
    .from("branch_requests")
    .select("*")
    .eq("restaurant_id", data.restaurantId)
    .eq("requested_by", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return { requests: rows ?? [] };
}

async function listAllBranchRequests(userId: string) {
  await assertAdmin(userId);
  const { data: rows, error } = await admin
    .from("branch_requests")
    .select("*, restaurants(name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return { requests: rows ?? [] };
}

async function acceptBranchRequest(userId: string, data: any) {
  await assertAdmin(userId);
  const { data: req, error: rErr } = await admin
    .from("branch_requests")
    .select("*")
    .eq("id", data.requestId)
    .maybeSingle();
  if (rErr) throw new Error(rErr.message);
  if (!req) throw new Error("Request not found");
  if (req.status !== "pending") throw new Error(`Already ${req.status}`);

  const token = randomToken();
  let staffId: string;

  if (req.request_type === "reissue") {
    if (!req.existing_staff_id) throw new Error("Missing existing staff");
    const { error: uErr } = await admin
      .from("restaurant_staff")
      .update({ nfc_token: token, label: req.branch_label })
      .eq("id", req.existing_staff_id);
    if (uErr) throw new Error(uErr.message);
    staffId = req.existing_staff_id;
  } else {
    let userIdToLink: string | null = null;
    const { data: existing } = await admin.auth.admin.listUsers();
    const found = existing.users.find(
      (u: any) => u.email?.toLowerCase() === (req.staff_email ?? "").toLowerCase(),
    );
    if (found) {
      userIdToLink = found.id;
    } else {
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: req.staff_email!,
        password: req.staff_password!,
        email_confirm: true,
        user_metadata: { full_name: req.staff_full_name },
      });
      if (cErr) throw new Error(cErr.message);
      userIdToLink = created.user?.id ?? null;
    }
    if (!userIdToLink) throw new Error("Failed to create staff user");

    const { data: staffRow, error: linkErr } = await admin
      .from("restaurant_staff")
      .insert({
        restaurant_id: req.restaurant_id,
        user_id: userIdToLink,
        label: req.branch_label,
        password: req.staff_password,
        nfc_token: token,
      })
      .select("id")
      .single();
    if (linkErr) throw new Error(linkErr.message);
    staffId = staffRow.id;
  }

  const { error: upErr } = await admin
    .from("branch_requests")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      resulting_staff_id: staffId,
    })
    .eq("id", req.id);
  if (upErr) throw new Error(upErr.message);

  return { ok: true, staffId, token };
}

async function markBranchRequestShipped(userId: string, data: any) {
  await assertAdmin(userId);
  const { error } = await admin
    .from("branch_requests")
    .update({ status: "shipped", shipped_at: new Date().toISOString() })
    .eq("id", data.requestId)
    .eq("status", "accepted");
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function markBranchRequestDelivered(userId: string, data: any) {
  await assertAdmin(userId);
  const now = new Date().toISOString();
  const { error } = await admin
    .from("branch_requests")
    .update({ status: "delivered", delivered_at: now, paid_at: now })
    .eq("id", data.requestId)
    .eq("status", "shipped");
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function rejectBranchRequest(userId: string, data: any) {
  await assertAdmin(userId);
  const { error } = await admin
    .from("branch_requests")
    .update({ status: "rejected", reject_reason: data.reason })
    .eq("id", data.requestId)
    .in("status", ["pending", "accepted"]);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ============================================================
// Dispatcher
// ============================================================

const actions: Record<string, (userId: string, data: any) => Promise<any>> = {
  stampVisitByNfc,
  adminTestStampVisit,
  setStaffNfcToken,
  addStaffAccount,
  removeStaffAccount,
  createBranchRequest,
  listMyBranchRequests,
  listAllBranchRequests: (uid) => listAllBranchRequests(uid),
  acceptBranchRequest,
  markBranchRequestShipped,
  markBranchRequestDelivered,
  rejectBranchRequest,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return err("Method not allowed", 405);

  try {
    const userId = await getCallerUserId(req);
    if (!userId) return err("Unauthorized", 401);

    const body = await req.json();
    const { action, data } = body ?? {};
    if (typeof action !== "string" || !(action in actions)) {
      return err(`Unknown action: ${action}`, 400);
    }
    const result = await actions[action](userId, data ?? {});
    return json(result);
  } catch (e: any) {
    console.error("[app-api]", e);
    return err(e?.message ?? "Server error", 400);
  }
});
