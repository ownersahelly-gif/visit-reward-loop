
-- 1. Profile additions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS birthday date;

-- Backfill email from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- Update handle_new_user to capture email + birthday
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  insert into public.profiles (id, full_name, email, birthday)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    nullif(new.raw_user_meta_data->>'birthday','')::date
  )
  on conflict (id) do update set email = excluded.email;
  insert into public.user_roles (user_id, role)
  values (new.id, 'customer')
  on conflict do nothing;
  return new;
end;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. restaurant_staff table
CREATE TABLE IF NOT EXISTS public.restaurant_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, user_id)
);

ALTER TABLE public.restaurant_staff ENABLE ROW LEVEL SECURITY;

-- helper
CREATE OR REPLACE FUNCTION private.is_restaurant_staff(_user_id uuid, _restaurant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurant_staff
    WHERE user_id = _user_id AND restaurant_id = _restaurant_id
  );
$$;

GRANT EXECUTE ON FUNCTION private.is_restaurant_staff(uuid, uuid) TO authenticated;

-- RLS for restaurant_staff
CREATE POLICY "owner manages own staff"
  ON public.restaurant_staff FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_staff.restaurant_id AND r.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_staff.restaurant_id AND r.owner_id = auth.uid()));

CREATE POLICY "staff reads own assignments"
  ON public.restaurant_staff FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "admins manage staff"
  ON public.restaurant_staff FOR ALL
  TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

-- 3. Extend redemption_codes & redemptions RLS for staff
CREATE POLICY "staff read restaurant codes"
  ON public.redemption_codes FOR SELECT
  TO authenticated
  USING (private.is_restaurant_staff(auth.uid(), restaurant_id));

CREATE POLICY "staff update restaurant codes"
  ON public.redemption_codes FOR UPDATE
  TO authenticated
  USING (private.is_restaurant_staff(auth.uid(), restaurant_id));

CREATE POLICY "staff insert restaurant redemptions"
  ON public.redemptions FOR INSERT
  TO authenticated
  WITH CHECK (private.is_restaurant_staff(auth.uid(), restaurant_id));

CREATE POLICY "staff read restaurant redemptions"
  ON public.redemptions FOR SELECT
  TO authenticated
  USING (private.is_restaurant_staff(auth.uid(), restaurant_id));

-- 4. Let owners read profile info of customers who have visited their offers
CREATE POLICY "owner reads visiting customer profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.visits v
      JOIN public.offers o ON o.id = v.offer_id
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE v.user_id = profiles.id AND r.owner_id = auth.uid()
    )
  );
