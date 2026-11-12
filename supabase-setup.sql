-- Our Budget: run ONCE in Supabase -> SQL Editor -> New query -> paste -> Run.
-- Safe to run in the same Supabase project as the habit tracker (separate tables).

-- ---------- Tables ----------
create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Our home' check (char_length(name) <= 40),
  join_code   text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)                       -- one household per person
);

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0 and amount < 1000000),
  category     text not null check (char_length(category) <= 40),
  place        text check (char_length(place) <= 80),      -- "where"
  note         text check (char_length(note) <= 200),
  spent_on     date not null default current_date check (spent_on > '2000-01-01'),
  created_at   timestamptz not null default now()
);
create index if not exists expenses_hh_day on public.expenses (household_id, spent_on desc);
create index if not exists expenses_user_day on public.expenses (user_id, spent_on);

create table if not exists public.budgets (
  household_id  uuid not null references public.households(id) on delete cascade,
  category      text not null check (char_length(category) <= 40),
  monthly_limit numeric(12,2) not null check (monthly_limit >= 0),
  primary key (household_id, category)
);

-- "No-spend day" = a vote for the habit even when nothing was bought
create table if not exists public.no_spend_days (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  day          date not null,
  primary key (user_id, day)
);

-- ---------- Helper: which household am I in? ----------
create or replace function public.my_household() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from public.household_members where user_id = auth.uid() limit 1
$$;

-- ---------- Row Level Security: you only ever see your own household ----------
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.expenses          enable row level security;
alter table public.budgets           enable row level security;
alter table public.no_spend_days     enable row level security;

drop policy if exists hh_select on public.households;
create policy hh_select on public.households for select to authenticated
  using (id = public.my_household());
drop policy if exists hh_update on public.households;
create policy hh_update on public.households for update to authenticated
  using (id = public.my_household()) with check (id = public.my_household());
revoke insert, update, delete on public.households from anon, authenticated;
grant update (name) on public.households to authenticated;     -- can rename, not change code

drop policy if exists mem_select on public.household_members;
create policy mem_select on public.household_members for select to authenticated
  using (household_id = public.my_household());
drop policy if exists mem_update on public.household_members;
create policy mem_update on public.household_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on public.household_members from anon, authenticated;
grant update (display_name) on public.household_members to authenticated;

drop policy if exists exp_select on public.expenses;
create policy exp_select on public.expenses for select to authenticated
  using (household_id = public.my_household());
drop policy if exists exp_insert on public.expenses;
create policy exp_insert on public.expenses for insert to authenticated
  with check (household_id = public.my_household() and user_id = auth.uid());
drop policy if exists exp_update on public.expenses;
create policy exp_update on public.expenses for update to authenticated
  using (household_id = public.my_household() and user_id = auth.uid())
  with check (household_id = public.my_household() and user_id = auth.uid());
drop policy if exists exp_delete on public.expenses;
create policy exp_delete on public.expenses for delete to authenticated
  using (household_id = public.my_household() and user_id = auth.uid());

drop policy if exists bud_all on public.budgets;
create policy bud_all on public.budgets for all to authenticated
  using (household_id = public.my_household()) with check (household_id = public.my_household());

drop policy if exists ns_select on public.no_spend_days;
create policy ns_select on public.no_spend_days for select to authenticated
  using (household_id = public.my_household());
drop policy if exists ns_insert on public.no_spend_days;
create policy ns_insert on public.no_spend_days for insert to authenticated
  with check (household_id = public.my_household() and user_id = auth.uid());
drop policy if exists ns_delete on public.no_spend_days;
create policy ns_delete on public.no_spend_days for delete to authenticated
  using (user_id = auth.uid());

revoke all on public.expenses, public.budgets, public.no_spend_days from anon;

-- ---------- Table access for logged-in users (new Supabase projects don't grant it automatically) ----------
grant usage on schema public to authenticated;
grant select on public.households, public.household_members to authenticated;
grant select, insert, update, delete on public.expenses, public.budgets to authenticated;
grant select, insert, delete on public.no_spend_days to authenticated;
grant update (name) on public.households to authenticated;
grant update (display_name) on public.household_members to authenticated;

-- ---------- Create / join a household ----------
create or replace function public.create_household(p_name text, p_display text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'You are already in a household';
  end if;
  if coalesce(trim(p_display), '') = '' then raise exception 'Enter your name'; end if;
  insert into households (name, created_by)
    values (left(coalesce(nullif(trim(p_name), ''), 'Our home'), 40), auth.uid())
    returning id into v_id;
  insert into household_members (household_id, user_id, display_name)
    values (v_id, auth.uid(), left(trim(p_display), 30));
  return v_id;
end $$;

create or replace function public.join_household(p_code text, p_display text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'You are already in a household';
  end if;
  if coalesce(trim(p_display), '') = '' then raise exception 'Enter your name'; end if;
  select id into v_id from households where join_code = upper(trim(p_code));
  if v_id is null then
    perform pg_sleep(1);                     -- slows down code guessing
    raise exception 'Join code not found';
  end if;
  if (select count(*) from household_members where household_id = v_id) >= 6 then
    raise exception 'Household is full';
  end if;
  insert into household_members (household_id, user_id, display_name)
    values (v_id, auth.uid(), left(trim(p_display), 30));
  return v_id;
end $$;

revoke all on function public.my_household()                from public, anon;
revoke all on function public.create_household(text, text)  from public, anon;
revoke all on function public.join_household(text, text)    from public, anon;
grant execute on function public.my_household()               to authenticated;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text)   to authenticated;

-- ---------- Realtime: partner's entries appear live ----------
do $$ begin alter publication supabase_realtime add table public.expenses;          exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.budgets;           exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.no_spend_days;     exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.household_members; exception when duplicate_object then null; end $$;

-- ---------- v2: item (what it was for) + item notes ----------

alter table public.expenses add column if not exists item text check (char_length(item) <= 60);
create index if not exists expenses_hh_item on public.expenses (household_id, spent_on) where item is not null;

create table if not exists public.item_notes (
  household_id uuid not null references public.households(id) on delete cascade,
  item_key     text not null check (char_length(item_key) <= 60),   -- lower-case item name
  note         text not null check (char_length(note) between 1 and 200),
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (household_id, item_key)
);
alter table public.item_notes enable row level security;
drop policy if exists notes_all on public.item_notes;
create policy notes_all on public.item_notes for all to authenticated
  using (household_id = public.my_household()) with check (household_id = public.my_household());
revoke all on public.item_notes from anon;
grant select, insert, update, delete on public.item_notes to authenticated;

do $$ begin alter publication supabase_realtime add table public.item_notes; exception when duplicate_object then null; end $$;
