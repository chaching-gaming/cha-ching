-- Settlement Notification Triggers
--
-- New notifications:
-- 1. bet_pending_dispute - When entering PENDING_DISPUTE, notify all stakers
-- 2. bet_dispute_raised - When manually disputed, notify admins/attestors

-- ============================================================
-- 1. Update notification type constraint to include new types
-- ============================================================

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'bet_matched', 'bet_settled', 'bet_won', 'bet_lost', 'bet_voided',
    'bet_disputed', 'bet_expiring', 'chip_request_created', 'chip_donated',
    'bet_accepted', 'bet_created', 'bet_pending_dispute', 'bet_dispute_raised'
  ));

-- ============================================================
-- 2. Trigger: on_bet_pending_dispute
-- ============================================================
-- When a bet transitions to PENDING_DISPUTE, notify all stakers about the
-- preliminary result and the 30s window to dispute.

CREATE OR REPLACE FUNCTION public.trigger_bet_pending_dispute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stakers uuid[];
  v_dispute_seconds int;
BEGIN
  -- Only fire on transition to PENDING_DISPUTE
  IF old.status = 'PENDING_DISPUTE' OR new.status IS DISTINCT FROM 'PENDING_DISPUTE' THEN
    RETURN new;
  END IF;

  -- Get all participants
  SELECT array_agg(DISTINCT user_id) INTO v_stakers
    FROM public.bet_stakes
   WHERE bet_id = new.id;

  -- Calculate remaining dispute time
  v_dispute_seconds := EXTRACT(EPOCH FROM (new.dispute_window_ends_at - now()))::int;
  IF v_dispute_seconds < 0 THEN
    v_dispute_seconds := 30;
  END IF;

  IF v_stakers IS NOT NULL AND array_length(v_stakers, 1) > 0 THEN
    PERFORM public.notify_users(
      'bet_pending_dispute',
      v_stakers,
      'Confirm Result',
      'Result: ' || COALESCE(new.preliminary_outcome, 'TBD') || '. You have ' || v_dispute_seconds || 's to dispute.',
      jsonb_build_object(
        'room_id', new.room_id,
        'bet_id', new.id,
        'preliminary_outcome', new.preliminary_outcome,
        'dispute_window_seconds', v_dispute_seconds
      )
    );
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_bet_pending_dispute ON public.bets;
CREATE TRIGGER on_bet_pending_dispute
AFTER UPDATE ON public.bets
FOR EACH ROW
EXECUTE FUNCTION public.trigger_bet_pending_dispute();

-- ============================================================
-- 3. Trigger: on_bet_dispute_raised
-- ============================================================
-- When a participant manually raises a dispute, notify admins/attestors.

CREATE OR REPLACE FUNCTION public.trigger_bet_dispute_raised()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admins uuid[];
  v_disputer_name text;
BEGIN
  -- Only fire when disputed_by is set (manual dispute)
  IF new.disputed_by IS NULL THEN
    RETURN new;
  END IF;

  -- Only fire on transition to DISPUTED from PENDING_DISPUTE
  IF old.status IS DISTINCT FROM 'PENDING_DISPUTE' OR new.status IS DISTINCT FROM 'DISPUTED' THEN
    RETURN new;
  END IF;

  -- Get disputer's name
  SELECT display_name INTO v_disputer_name
    FROM public.profiles
   WHERE id = new.disputed_by;

  -- Get all admins and attestors in the room
  SELECT array_agg(user_id) INTO v_admins
    FROM public.room_members
   WHERE room_id = new.room_id
     AND role IN ('ADMIN', 'ATTESTOR');

  IF v_admins IS NOT NULL AND array_length(v_admins, 1) > 0 THEN
    PERFORM public.notify_users(
      'bet_dispute_raised',
      v_admins,
      'Dispute Raised',
      COALESCE(v_disputer_name, 'Someone') || ' disputed: "' || left(new.question, 40) || '"',
      jsonb_build_object(
        'room_id', new.room_id,
        'bet_id', new.id,
        'disputed_by', new.disputed_by,
        'disputer_name', v_disputer_name
      )
    );
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_bet_dispute_raised ON public.bets;
CREATE TRIGGER on_bet_dispute_raised
AFTER UPDATE ON public.bets
FOR EACH ROW
EXECUTE FUNCTION public.trigger_bet_dispute_raised();
