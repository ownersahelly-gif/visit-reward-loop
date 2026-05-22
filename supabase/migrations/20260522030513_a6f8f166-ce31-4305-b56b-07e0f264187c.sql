INSERT INTO public.user_roles (user_id, role)
SELECT u.id, r.role
FROM auth.users u
CROSS JOIN (VALUES ('owner'::public.app_role), ('admin'::public.app_role), ('customer'::public.app_role)) AS r(role)
WHERE lower(u.email) = lower('Ali_ehab@aucegypt.edu')
ON CONFLICT (user_id, role) DO NOTHING;