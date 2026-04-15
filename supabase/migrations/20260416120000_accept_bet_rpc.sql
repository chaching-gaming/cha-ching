-- RPC: accept_bet — room members, active session, OPEN bet, valid pick, not self.

create or replace function public.accept_bet(p_bet_id uuid, p_pick text)
returns public.bets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet public.bets;
  v_room public.rooms;
  v_pick text;
  v_i int;
  v_opt text;
  v_ok boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0001';
  end if;

  select * into v_bet from public.bets where id = p_bet_id for update;
  if v_bet is null then
    raise exception 'Bet not found' using errcode = 'P0002';
  end if;

  if v_bet.status is distinct from 'OPEN' then
    raise exception 'Bet is not open for acceptance' using errcode = 'P0003';
  end if;

  if v_bet.offered_by is not distinct from auth.uid() then
    raise exception 'Cannot accept your own bet' using errcode = 'P0004';
  end if;

  if v_bet.expires_at is not null and v_bet.expires_at <= now() then
    raise exception 'Bet has expired' using errcode = 'P0005';
  end if;

  v_pick := trim(p_pick);
  if v_pick = '' then
    raise exception 'Pick is required' using errcode = 'P0006';
  end if;

  if jsonb_typeof(v_bet.options) is distinct from 'array' then
    raise exception 'Invalid bet options' using errcode = 'P0007';
  end if;

  for v_i in 0..(jsonb_array_length(v_bet.options) - 1) loop
    if jsonb_typeof(v_bet.options -> v_i) is distinct from 'string' then
      raise exception 'Each option must be a string' using errcode = 'P0008';
    end if;
    v_opt := trim(v_bet.options ->> v_i);
    if lower(v_opt) = lower(v_pick) then
      v_pick := v_opt;
      v_ok := true;
      exit;
    end if;
  end loop;

  if not v_ok then
    raise exception 'Pick is not a valid option' using errcode = 'P0009';
  end if;

  select * into v_room from public.rooms where id = v_bet.room_id;
  if v_room is null then
    raise exception 'Room not found' using errcode = 'P0010';
  end if;
  if not v_room.is_active then
    raise exception 'Session is not active' using errcode = 'P0011';
  end if;

  if not public.is_room_member(v_bet.room_id) then
    raise exception 'Not a member of this room' using errcode = 'P0012';
  end if;

  update public.bets
  set
    accepted_by = auth.uid(),
    accepted_pick = v_pick,
    status = 'MATCHED'
  where id = p_bet_id
  returning * into v_bet;

  return v_bet;
end;
$$;

grant execute on function public.accept_bet(uuid, text) to authenticated;
