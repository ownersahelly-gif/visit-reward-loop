
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  intended public.app_role;
begin
  insert into public.profiles (id, full_name, email, birthday)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    nullif(new.raw_user_meta_data->>'birthday','')::date
  )
  on conflict (id) do update set email = excluded.email;

  intended := coalesce(
    nullif(new.raw_user_meta_data->>'intended_role','')::public.app_role,
    'customer'::public.app_role
  );

  insert into public.user_roles (user_id, role)
  values (new.id, intended)
  on conflict do nothing;

  return new;
end;
$$;
