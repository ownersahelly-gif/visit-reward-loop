
-- Roles enum + user_roles table
create type public.app_role as enum ('admin', 'owner', 'customer');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "users read own roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid());
create policy "admins read all roles" on public.user_roles
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "users self-assign customer/owner" on public.user_roles
  for insert to authenticated
  with check (user_id = auth.uid() and role in ('customer','owner'));
create policy "admins manage roles" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles readable by authenticated" on public.profiles
  for select to authenticated using (true);
create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid());
create policy "users insert own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());

-- Auto-create profile + default customer role on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  insert into public.user_roles (user_id, role)
  values (new.id, 'customer');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Restaurants
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  description text,
  cuisine text,
  image_url text,
  status text not null default 'in_progress',
  created_at timestamptz not null default now()
);
alter table public.restaurants enable row level security;

create policy "anyone reads restaurants" on public.restaurants
  for select using (true);
create policy "owners insert their restaurant" on public.restaurants
  for insert to authenticated
  with check (owner_id = auth.uid() and public.has_role(auth.uid(), 'owner'));
create policy "owners update own restaurant" on public.restaurants
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and status = 'in_progress');
create policy "admins manage restaurants" on public.restaurants
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Offers
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  title text not null,
  description text,
  reward text not null,
  required_visits int not null default 5,
  window_days int not null default 30,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.offers enable row level security;

create policy "anyone reads offers" on public.offers for select using (true);
create policy "owner manages own offers" on public.offers
  for all to authenticated
  using (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()))
  with check (exists (select 1 from public.restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));
create policy "admins manage offers" on public.offers
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Visits
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  visited_at timestamptz not null default now()
);
alter table public.visits enable row level security;

create index visits_user_offer_idx on public.visits (user_id, offer_id);

create policy "users read own visits" on public.visits
  for select to authenticated using (user_id = auth.uid());
create policy "owner reads visits on own offers" on public.visits
  for select to authenticated using (
    exists (
      select 1 from public.offers o
      join public.restaurants r on r.id = o.restaurant_id
      where o.id = offer_id and r.owner_id = auth.uid()
    )
  );
create policy "users insert own visits" on public.visits
  for insert to authenticated with check (user_id = auth.uid());
create policy "users delete own visits" on public.visits
  for delete to authenticated using (user_id = auth.uid());
