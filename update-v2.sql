-- Our Budget v2 update: run ONCE in Supabase -> SQL Editor -> New query -> Run.
-- Adds "What is it for?" (item) to expenses and shared notes per item.

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
