-- Rename ledger_entries.type enum to the spec names.
--
--   BET      (−stake, stake lock)       → BET_LOSS
--   WIN      (+payout, settlement)      → BET_WIN
--   REFUND   (void reversal)            → VOID_REFUND
--   DONATION (signed, chip recovery)    → DONATION_OUT (amount < 0) / DONATION_IN (amount > 0)
--   GRANT    (starting 1000-chip seed)  → GRANT (kept; outside the ticket's 5-value enum but
--                                                semantically distinct from win/loss/refund/donation)
--
-- Data is migrated in place. Every write-site function is then re-emitted with
-- the new literals. For six of the seven functions the body only differs by the
-- quoted enum token, so we use `pg_get_functiondef` + ordered `replace()` to
-- regenerate them in a single DO block. `donate_chips` splits by amount sign
-- into DONATION_OUT / DONATION_IN, so it gets an explicit re-emit.
--
-- GRANT is untouched — both the enum value and the partial unique index
-- (`... WHERE type = 'GRANT'`) stay valid.

-- ============================================================
-- 1. Drop old constraints
-- ============================================================

alter table public.ledger_entries drop constraint ledger_entries_type_check;
alter table public.ledger_entries drop constraint ledger_entries_donation_has_request;

-- ============================================================
-- 2. Data migration — rewrite existing rows
-- ============================================================

update public.ledger_entries
   set type = case type
     when 'BET' then 'BET_LOSS'
     when 'WIN' then 'BET_WIN'
     when 'REFUND' then 'VOID_REFUND'
     when 'DONATION' then
       case when amount < 0 then 'DONATION_OUT' else 'DONATION_IN' end
     else type  -- GRANT stays
   end
 where type in ('BET', 'WIN', 'REFUND', 'DONATION');

-- ============================================================
-- 3. New constraints
-- ============================================================

alter table public.ledger_entries
  add constraint ledger_entries_type_check
    check (type in ('BET_WIN', 'BET_LOSS', 'VOID_REFUND', 'DONATION_IN', 'DONATION_OUT', 'GRANT'));

alter table public.ledger_entries
  add constraint ledger_entries_donation_has_request
    check (type not in ('DONATION_IN', 'DONATION_OUT') or chip_request_id is not null);

-- ============================================================
-- 4. Re-emit functions whose only change is the quoted enum token
-- ============================================================

do $$
declare
  v_func_name text;
  v_oid oid;
  v_def text;
  v_new_def text;
begin
  foreach v_func_name in array array[
    'create_bet', 'join_bet', 'accept_bet', 'expire_open_bets',
    'settle_bet', 'resolve_dispute', 'void_bet'
  ]
  loop
    for v_oid in
      select p.oid
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where p.proname = v_func_name
         and n.nspname = 'public'
    loop
      v_def := pg_get_functiondef(v_oid);
      v_new_def := v_def;
      -- Token-exact replaces on the quoted enum values only. No function body
      -- contains these tokens in any non-enum context (verified).
      v_new_def := replace(v_new_def, '''BET''', '''BET_LOSS''');
      v_new_def := replace(v_new_def, '''WIN''', '''BET_WIN''');
      v_new_def := replace(v_new_def, '''REFUND''', '''VOID_REFUND''');
      execute v_new_def;
    end loop;
  end loop;
end $$;

-- ============================================================
-- 5. donate_chips — explicit re-emit (DONATION splits into IN/OUT)
-- ============================================================

create or replace function public.donate_chips(
  p_chip_request_id uuid,
  p_amount int
)
returns public.chip_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.chip_requests;
  v_room public.rooms;
  v_donor_balance numeric;
  v_remaining int;
  v_new_fulfilled int;
  v_new_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'P0621';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Donation amount must be positive' using errcode = 'P0622';
  end if;

  select * into v_req from public.chip_requests
   where id = p_chip_request_id for update;
  if v_req is null then
    raise exception 'Chip request not found' using errcode = 'P0623';
  end if;

  if v_req.status is distinct from 'OPEN' then
    raise exception 'Chip request is not open' using errcode = 'P0624';
  end if;

  if v_req.requested_by = auth.uid() then
    raise exception 'You cannot donate to your own request' using errcode = 'P0625';
  end if;

  if not public.is_room_member(v_req.room_id) then
    raise exception 'Not a member of this room' using errcode = 'P0626';
  end if;

  select * into v_room from public.rooms where id = v_req.room_id;
  if v_room is null then
    raise exception 'Room not found' using errcode = 'P0627';
  end if;
  if not v_room.is_active then
    raise exception 'Session is not active' using errcode = 'P0628';
  end if;

  v_remaining := v_req.requested_amount - v_req.fulfilled_amount;
  if p_amount > v_remaining then
    raise exception 'Donation exceeds remaining need' using errcode = 'P0629';
  end if;

  select coalesce(sum(amount), 0) into v_donor_balance
    from public.ledger_entries
   where room_id = v_req.room_id and user_id = auth.uid();

  if v_room.per_user_chip_limit is not null
     and (v_donor_balance - p_amount) < v_room.per_user_chip_limit then
    raise exception 'You would exceed the loss limit for this room' using errcode = 'P0630';
  end if;

  -- Split by direction: donor gets DONATION_OUT (−amount), requester gets
  -- DONATION_IN (+amount). Both linked to the chip_request.
  insert into public.ledger_entries (room_id, type, user_id, amount, chip_request_id)
  values
    (v_req.room_id, 'DONATION_OUT', auth.uid(),         -p_amount, v_req.id),
    (v_req.room_id, 'DONATION_IN',  v_req.requested_by,  p_amount, v_req.id);

  v_new_fulfilled := v_req.fulfilled_amount + p_amount;
  v_new_status := case
    when v_new_fulfilled >= v_req.requested_amount then 'FULFILLED'
    else 'OPEN'
  end;

  update public.chip_requests
     set fulfilled_amount = v_new_fulfilled,
         status = v_new_status
   where id = v_req.id
  returning * into v_req;

  return v_req;
end;
$$;
