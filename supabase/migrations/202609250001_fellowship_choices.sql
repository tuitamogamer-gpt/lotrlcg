-- Account identity and passwords are managed by Supabase Auth.
create table public.fellowship_choices (
  user_id uuid primary key references auth.users(id) on delete cascade,
  choices jsonb not null,
  updated_at timestamptz not null default now(),
  constraint valid_choices check (coalesce((
    jsonb_typeof(choices) = 'object'
    and choices @> '{"version":1}'::jsonb
    and choices ?& array['setupMode','selectedDeck','seatDecks','playMode','scenario']
    and choices->>'setupMode' in ('classic','hotseat')
    and choices->>'selectedDeck' in ('leadership','tactics','spirit','lore')
    and choices->>'playMode' in ('normal','campaign')
    and choices->>'scenario' in ('mirkwood','anduin','dol-guldur')
    and jsonb_typeof(choices->'seatDecks') = 'array'
    and jsonb_array_length(choices->'seatDecks') between 1 and 4
    and choices->'seatDecks' <@ '["leadership","tactics","spirit","lore"]'::jsonb
    and jsonb_array_length(choices->'seatDecks') =
      (case when choices->'seatDecks' ? 'leadership' then 1 else 0 end) +
      (case when choices->'seatDecks' ? 'tactics' then 1 else 0 end) +
      (case when choices->'seatDecks' ? 'spirit' then 1 else 0 end) +
      (case when choices->'seatDecks' ? 'lore' then 1 else 0 end)
    and octet_length(choices::text) < 4096
  ), false))
);
alter table public.fellowship_choices enable row level security;
revoke all on public.fellowship_choices from anon, authenticated;
grant select, insert, update, delete on public.fellowship_choices to authenticated;
create policy "Read own fellowship" on public.fellowship_choices for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own fellowship" on public.fellowship_choices for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own fellowship" on public.fellowship_choices for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own fellowship" on public.fellowship_choices for delete to authenticated using ((select auth.uid()) = user_id);
create function public.fellowship_choices_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger fellowship_choices_updated_at before update on public.fellowship_choices for each row execute function public.fellowship_choices_updated_at();
