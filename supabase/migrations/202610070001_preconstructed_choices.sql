-- Extend setup choices to the built-in precons, custom references and scripted quests.
-- The ownership policies and private user rows are unchanged.
create function public.fellowship_deck_id_valid(id text)
returns boolean language sql immutable parallel safe set search_path = '' as $$
  select coalesce(id in (
    'leadership', 'tactics', 'spirit', 'lore',
    'starter-dwarves', 'starter-elves', 'starter-gondor', 'starter-rohan',
    'limited-leadership-spirit', 'limited-lore-tactics'
  ) or id ~ '^custom:[A-Za-z0-9_-]{1,64}$', false);
$$;

create function public.fellowship_choices_valid(value jsonb)
returns boolean language plpgsql immutable parallel safe set search_path = '' as $$
declare
  seat jsonb;
  seen text[] := array[]::text[];
begin
  if not coalesce(
    jsonb_typeof(value) = 'object'
    and value @> '{"version":1}'::jsonb
    and value ?& array['setupMode','selectedDeck','seatDecks','playMode','scenario']
    and value->>'setupMode' in ('classic','hotseat')
    and jsonb_typeof(value->'selectedDeck') = 'string'
    and public.fellowship_deck_id_valid(value->>'selectedDeck')
    and value->>'playMode' in ('normal','campaign')
    and value->>'scenario' in (
      'mirkwood', 'anduin', 'dol-guldur', 'hunt-for-gollum',
      'conflict-at-the-carrock', 'journey-to-rhosgobel', 'hills-of-emyn-muil',
      'dead-marshes', 'return-to-mirkwood', 'into-the-pit', 'the-seventh-level',
      'flight-from-moria', 'redhorn-gate', 'road-to-rivendell',
      'watcher-in-the-water', 'the-long-dark', 'foundations-of-stone',
      'shadow-and-flame', 'peril-in-pelargir', 'into-ithilien',
      'siege-of-cair-andros', 'the-stewards-fear', 'the-druadan-forest',
      'encounter-at-amon-din', 'assault-on-osgiliath',
      'the-blood-of-gondor', 'the-morgul-vale'
    )
    and jsonb_typeof(value->'seatDecks') = 'array'
    and octet_length(value::text) < 4096,
    false
  ) then return false; end if;
  if jsonb_array_length(value->'seatDecks') not between 1 and 4 then
    return false;
  end if;
  for seat in select * from jsonb_array_elements(value->'seatDecks') loop
    if jsonb_typeof(seat) <> 'string'
      or not public.fellowship_deck_id_valid(seat #>> '{}')
      or (seat #>> '{}') = any(seen) then
      return false;
    end if;
    seen := array_append(seen, seat #>> '{}');
  end loop;
  return true;
end;
$$;

alter table public.fellowship_choices drop constraint valid_choices;
alter table public.fellowship_choices add constraint valid_choices
  check (public.fellowship_choices_valid(choices));
