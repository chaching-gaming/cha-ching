-- Allow cancelling chip requests even with partial donations
-- Previously, users could only cancel if no donations were received.
-- Now, users can cancel anytime while the request is OPEN.
-- Any donations already received stay with the requester.

create or replace function public.cancel_chip_request(p_chip_request_id uuid)
returns public.chip_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.chip_requests;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0631';
  end if;

  select * into v_req from public.chip_requests
   where id = p_chip_request_id for update;
  if v_req is null then
    raise exception 'Chip request not found' using errcode = 'P0632';
  end if;

  if v_req.requested_by is distinct from auth.uid() then
    raise exception 'Only the requester can cancel this request' using errcode = 'P0633';
  end if;

  if v_req.status is distinct from 'OPEN' then
    raise exception 'Chip request is not open' using errcode = 'P0634';
  end if;

  -- Partial donations stay with the requester; we don't reverse them.
  -- User can now cancel even after receiving some donations.

  update public.chip_requests
     set status = 'EXPIRED'
   where id = v_req.id
  returning * into v_req;

  return v_req;
end;
$$;
