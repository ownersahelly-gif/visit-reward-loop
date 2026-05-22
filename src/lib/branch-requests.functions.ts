import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function randomToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admin only");
}

// ---------- Owner: create request ----------
export const createBranchRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      restaurantId: z.string().uuid(),
      requestType: z.enum(["new", "reissue"]).default("new"),
      branchLabel: z.string().min(1).max(80),
      staffEmail: z.string().email().max(255).optional(),
      staffPassword: z.string().min(6).max(72).optional(),
      staffFullName: z.string().min(1).max(120).optional(),
      existingStaffId: z.string().uuid().optional(),
      shippingAddress: z.string().min(5).max(500),
      notes: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: r } = await supabaseAdmin
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

    const { error, data: inserted } = await supabaseAdmin
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
  });

// ---------- Owner: list own requests ----------
export const listMyBranchRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ restaurantId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: rows, error } = await supabaseAdmin
      .from("branch_requests")
      .select("*")
      .eq("restaurant_id", data.restaurantId)
      .eq("requested_by", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { requests: rows ?? [] };
  });

// ---------- Admin: list all ----------
export const listAllBranchRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("branch_requests")
      .select("*, restaurants(name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { requests: rows ?? [] };
  });

// ---------- Admin: accept ----------
export const acceptBranchRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ requestId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: req, error: rErr } = await supabaseAdmin
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
      const { error: uErr } = await supabaseAdmin
        .from("restaurant_staff")
        .update({ nfc_token: token, label: req.branch_label })
        .eq("id", req.existing_staff_id);
      if (uErr) throw new Error(uErr.message);
      staffId = req.existing_staff_id;
    } else {
      // Create or find auth user
      let userIdToLink: string | null = null;
      const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
      const found = existing.users.find(
        (u) => u.email?.toLowerCase() === (req.staff_email ?? "").toLowerCase(),
      );
      if (found) {
        userIdToLink = found.id;
      } else {
        const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
          email: req.staff_email!,
          password: req.staff_password!,
          email_confirm: true,
          user_metadata: { full_name: req.staff_full_name },
        });
        if (cErr) throw new Error(cErr.message);
        userIdToLink = created.user?.id ?? null;
      }
      if (!userIdToLink) throw new Error("Failed to create staff user");

      const { data: staffRow, error: linkErr } = await supabaseAdmin
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

    const { error: upErr } = await supabaseAdmin
      .from("branch_requests")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        resulting_staff_id: staffId,
      })
      .eq("id", req.id);
    if (upErr) throw new Error(upErr.message);

    return { ok: true, staffId, token };
  });

// ---------- Admin: mark shipped ----------
export const markBranchRequestShipped = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("branch_requests")
      .update({ status: "shipped", shipped_at: new Date().toISOString() })
      .eq("id", data.requestId)
      .eq("status", "accepted");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: mark delivered + paid ----------
export const markBranchRequestDelivered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("branch_requests")
      .update({ status: "delivered", delivered_at: now, paid_at: now })
      .eq("id", data.requestId)
      .eq("status", "shipped");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: reject ----------
export const rejectBranchRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      requestId: z.string().uuid(),
      reason: z.string().min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("branch_requests")
      .update({ status: "rejected", reject_reason: data.reason })
      .eq("id", data.requestId)
      .in("status", ["pending", "accepted"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
