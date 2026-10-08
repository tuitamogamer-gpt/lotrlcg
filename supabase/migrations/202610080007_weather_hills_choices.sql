-- Allow the newly scripted The Weather Hills scenario in saved account choices.
create or replace function public.fellowship_choices_valid(value jsonb)
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
      'the-blood-of-gondor', 'the-morgul-vale', 'fords-of-isen', 'to-catch-an-orc', 'into-fangorn', 'the-dunland-trap', 'the-three-trials', 'trouble-in-tharbad', 'the-nin-in-eilph', 'celebrimbors-secret', 'the-antlered-crown', 'intruders-in-chetwood', 'the-weather-hills'
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
