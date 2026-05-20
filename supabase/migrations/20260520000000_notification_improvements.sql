-- Notification improvements:
--   * Add new notification types: bet_won, bet_lost, bet_voided, bet_accepted
--   * Replace generic bet_settled with personalized bet_won/bet_lost notifications
--   * Fix chip_donated to include donor name
--
-- Changes:
--   1. Update notification type constraint to include new types
--   2. Replace trigger_bet_settled() with personalized win/loss notifications
--   3. Replace trigger_chip_donated() to include donor name

-- ============================================================
-- 1. Update notification type constraint
-- ============================================================

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'bet_matched', 'bet_settled', 'bet_won', 'bet_lost', 'bet_voided',
    'bet_disputed', 'bet_expiring', 'chip_request_created', 'chip_donated', 'bet_accepted'
  ));

-- ============================================================
-- 2. Replace trigger_bet_settled() with personalized notifications
-- ============================================================
-- Instead of sending a single generic notification to all stakers,
-- send individual bet_won or bet_lost notifications with chip amounts

CREATE OR REPLACE FUNCTION public.trigger_bet_settled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stake record;
  v_is_winner boolean;
  v_total_pool int;
  v_n_winners int;
  v_payout int;
BEGIN
  -- Only fire on transition to SETTLED
  IF old.status = 'SETTLED' OR new.status IS DISTINCT FROM 'SETTLED' THEN
    RETURN new;
  END IF;

  -- Calculate pool and winner count
  SELECT sum(stake), count(*) FILTER (WHERE lower(trim(pick)) = lower(trim(new.outcome)))
    INTO v_total_pool, v_n_winners
    FROM public.bet_stakes WHERE bet_id = new.id;

  v_payout := CASE WHEN v_n_winners > 0 THEN v_total_pool / v_n_winners ELSE 0 END;

  -- Notify each participant individually
  FOR v_stake IN
    SELECT bs.user_id, bs.pick, bs.stake, p.display_name
      FROM public.bet_stakes bs
      JOIN public.profiles p ON p.id = bs.user_id
     WHERE bs.bet_id = new.id
  LOOP
    v_is_winner := lower(trim(v_stake.pick)) = lower(trim(new.outcome));

    IF v_is_winner THEN
      PERFORM public.notify_users(
        'bet_won',
        ARRAY[v_stake.user_id],
        'You Won!',
        'You won ' || v_payout || ' chips on "' || left(new.question, 40) || '"',
        jsonb_build_object(
          'room_id', new.room_id,
          'bet_id', new.id,
          'won', true,
          'amount', v_payout,
          'outcome', new.outcome
        )
      );
    ELSE
      PERFORM public.notify_users(
        'bet_lost',
        ARRAY[v_stake.user_id],
        'You Lost',
        'You lost ' || v_stake.stake || ' chips on "' || left(new.question, 40) || '"',
        jsonb_build_object(
          'room_id', new.room_id,
          'bet_id', new.id,
          'won', false,
          'amount', v_stake.stake,
          'outcome', new.outcome
        )
      );
    END IF;
  END LOOP;

  RETURN new;
END;
$$;

-- ============================================================
-- 3. Replace trigger_chip_donated() to include donor name
-- ============================================================
-- Query the most recent DONATION_OUT ledger entry to get donor name

CREATE OR REPLACE FUNCTION public.trigger_chip_donated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_donor_name text;
  v_amount int;
BEGIN
  -- Only fire when fulfilled_amount increases
  IF new.fulfilled_amount <= old.fulfilled_amount THEN
    RETURN new;
  END IF;

  v_amount := new.fulfilled_amount - old.fulfilled_amount;

  -- Get donor from most recent ledger entry for this chip request
  SELECT p.display_name INTO v_donor_name
    FROM public.ledger_entries le
    JOIN public.profiles p ON p.id = le.user_id
   WHERE le.chip_request_id = new.id
     AND le.type = 'DONATION_OUT'
   ORDER BY le.created_at DESC
   LIMIT 1;

  PERFORM public.notify_users(
    'chip_donated',
    ARRAY[new.requested_by],
    'Chips Received!',
    coalesce(v_donor_name, 'Someone') || ' donated ' || v_amount || ' chips to your request!',
    jsonb_build_object(
      'room_id', new.room_id,
      'chip_request_id', new.id,
      'donor_name', v_donor_name,
      'amount', v_amount
    )
  );

  RETURN new;
END;
$$;
