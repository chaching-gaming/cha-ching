-- Fix notification outcome labels
--
-- Problem: Notifications show raw "yes"/"no" instead of template labels like "HIT"/"MISS"
-- Solution: Look up question_templates and use positive_label/negative_label
--
-- Affected triggers:
--   1. trigger_bet_settled - shows outcome in "Bet Settled!" notification
--   2. trigger_bet_pending_dispute - shows preliminary_outcome in "Confirm Result" notification

-- ============================================================
-- 1. Helper function to get display label for an outcome
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_outcome_display_label(
  p_template_id text,
  p_outcome text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE lower(trim(COALESCE(p_outcome, '')))
    WHEN 'yes' THEN COALESCE(
      (SELECT positive_label FROM public.question_templates WHERE id = p_template_id::uuid),
      'Yes'
    )
    WHEN 'no' THEN COALESCE(
      (SELECT negative_label FROM public.question_templates WHERE id = p_template_id::uuid),
      'No'
    )
    ELSE COALESCE(p_outcome, 'N/A')
  END;
$$;

COMMENT ON FUNCTION public.get_outcome_display_label IS
  'Maps raw outcome (yes/no) to template display label (HIT/MISS, Make/Miss, etc.)';

-- ============================================================
-- 2. Update trigger_bet_settled to use display labels
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_bet_settled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stakers uuid[];
  v_display_outcome text;
BEGIN
  -- Only fire on transition to SETTLED
  IF old.status = 'SETTLED' OR new.status IS DISTINCT FROM 'SETTLED' THEN
    RETURN new;
  END IF;

  SELECT array_agg(DISTINCT user_id) INTO v_stakers
  FROM public.bet_stakes
  WHERE bet_id = new.id;

  -- Get display label for the outcome
  v_display_outcome := public.get_outcome_display_label(new.template_id, new.outcome);

  PERFORM public.notify_users(
    'bet_settled',
    v_stakers,
    'Bet Settled!',
    'The bet "' || left(new.question, 50) || '" has been settled. Outcome: ' || v_display_outcome,
    jsonb_build_object(
      'room_id', new.room_id,
      'bet_id', new.id,
      'outcome', new.outcome,
      'outcome_display', v_display_outcome
    )
  );

  RETURN new;
END;
$$;

-- ============================================================
-- 3. Update trigger_bet_pending_dispute to use display labels
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_bet_pending_dispute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stakers uuid[];
  v_dispute_seconds int;
  v_display_outcome text;
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

  -- Get display label for the preliminary outcome
  v_display_outcome := public.get_outcome_display_label(new.template_id, new.preliminary_outcome);

  IF v_stakers IS NOT NULL AND array_length(v_stakers, 1) > 0 THEN
    PERFORM public.notify_users(
      'bet_pending_dispute',
      v_stakers,
      'Confirm Result',
      'Result: ' || v_display_outcome || '. You have ' || v_dispute_seconds || 's to dispute.',
      jsonb_build_object(
        'room_id', new.room_id,
        'bet_id', new.id,
        'preliminary_outcome', new.preliminary_outcome,
        'preliminary_outcome_display', v_display_outcome,
        'dispute_window_seconds', v_dispute_seconds
      )
    );
  END IF;

  RETURN new;
END;
$$;
