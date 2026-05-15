-- Update request_chips threshold from 0 to 100
-- Users can now request chips when their balance is 100 or below

create or replace function public.request_chips(
  p_room_id uuid,
  p_amount int,
  p_message text default null
)
returns public.chip_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms;
  v_balance numeric;
  v_request public.chip_requests;
  v_msg text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0611';
  end if;

  if not public.is_room_member(p_room_id) then
    raise exception 'Not a member of this room' using errcode = 'P0612';
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if v_room is null then
    raise exception 'Room not found' using errcode = 'P0613';
  end if;
  if not v_room.is_active then
    raise exception 'Session is not active' using errcode = 'P0614';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Request amount must be a positive number' using errcode = 'P0615';
  end if;
  if p_amount > 100000 then
    raise exception 'Request amount is too large' using errcode = 'P0616';
  end if;

  select coalesce(sum(amount), 0) into v_balance
    from public.ledger_entries
   where room_id = p_room_id and user_id = auth.uid();

  -- Members can request chips when balance is 100 or below (fund me feature)
  if v_balance > 100 then
    raise exception 'You can only request chips when your balance is 100 or below' using errcode = 'P0617';
  end if;

  if exists (
    select 1 from public.chip_requests
     where room_id = p_room_id
       and requested_by = auth.uid()
       and status = 'OPEN'
  ) then
    raise exception 'You already have an open chip request in this room' using errcode = 'P0618';
  end if;

  v_msg := nullif(trim(coalesce(p_message, '')), '');

  insert into public.chip_requests
    (room_id, requested_by, current_balance, status,
     requested_amount, fulfilled_amount, message)
  values
    (p_room_id, auth.uid(), v_balance, 'OPEN',
     p_amount, 0, v_msg)
  returning * into v_request;

  return v_request;
end;
$$;
