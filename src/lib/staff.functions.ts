import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const addStaffSchema = z.object({
  restaurantId: z.string().uuid(),
  email: z.string().email().max(255),
  password: z.string().min(6).max(72),
  fullName: z.string().min(1).max(120),
  label: z.string().max(80).optional(),
});

export const addStaffAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => addStaffSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // verify caller owns the restaurant
    const { data: restaurant, error: rErr } = await supabaseAdmin
      .from("restaurants")
      .select("id, owner_id")
      .eq("id", data.restaurantId)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!restaurant || restaurant.owner_id !== userId) {
      throw new Error("Not authorized for this restaurant");
    }

    // Try to find an existing user with that email
    let userIdToLink: string | null = null;
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
    const found = existing.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
    if (found) {
      userIdToLink = found.id;
    } else {
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.fullName },
      });
      if (cErr) throw new Error(cErr.message);
      userIdToLink = created.user?.id ?? null;
    }
    if (!userIdToLink) throw new Error("Failed to create user");

    const { error: linkErr } = await supabaseAdmin
      .from("restaurant_staff")
      .insert({ restaurant_id: data.restaurantId, user_id: userIdToLink, label: data.label ?? null });
    if (linkErr && !linkErr.message.includes("duplicate")) throw new Error(linkErr.message);

    return { ok: true };
  });

export const removeStaffAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ staffId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: row } = await supabaseAdmin
      .from("restaurant_staff")
      .select("id, restaurant_id, restaurants(owner_id)")
      .eq("id", data.staffId)
      .maybeSingle();
    // @ts-ignore relational
    if (!row || row.restaurants?.owner_id !== userId) throw new Error("Not authorized");
    const { error } = await supabaseAdmin.from("restaurant_staff").delete().eq("id", data.staffId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
