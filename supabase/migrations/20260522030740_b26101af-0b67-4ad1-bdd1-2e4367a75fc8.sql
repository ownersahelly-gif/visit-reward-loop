CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;

DROP POLICY IF EXISTS "admins manage offers" ON public.offers;
CREATE POLICY "admins manage offers"
ON public.offers
FOR ALL
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "owners insert their restaurant" ON public.restaurants;
CREATE POLICY "owners insert their restaurant"
ON public.restaurants
FOR INSERT
TO authenticated
WITH CHECK ((owner_id = auth.uid()) AND private.has_role(auth.uid(), 'owner'::public.app_role));

DROP POLICY IF EXISTS "admins manage restaurants" ON public.restaurants;
CREATE POLICY "admins manage restaurants"
ON public.restaurants
FOR ALL
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
CREATE POLICY "admins manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "admins read all roles" ON public.user_roles;
CREATE POLICY "admins read all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;