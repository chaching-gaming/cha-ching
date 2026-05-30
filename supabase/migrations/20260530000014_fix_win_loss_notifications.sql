-- Fix win/loss notifications
--
-- The previous migration (20260530000012) accidentally reverted personalized
-- bet_won/bet_lost notifications back to generic bet_settled.
--
-- This migration restores personalized notifications AND includes the
-- outcome display label fix (showing "HIT" instead of "yes").

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
  v_display_outcome text;
BEGIN
  -- Only fire on transition to SETTLED
  IF old.status = 'SETTLED' OR new.status IS DISTINCT FROM 'SETTLED' THEN
    RETURN new;
  END IF;

  -- Get display label for the outcome (e.g., "HIT" instead of "yes")
  v_display_outcome := public.get_outcome_display_label(new.template_id, new.outcome);

  -- Calculate pool and winner count
  SELECT sum(stake), count(*) FILTER (WHERE lower(trim(pick)) = lower(trim(new.outcome)))
    INTO v_total_pool, v_n_winners
    FROM public.bet_stakes WHERE bet_id = new.id;

  v_payout := CASE WHEN v_n_winners > 0 THEN v_total_pool / v_n_winners ELSE 0 END;

  -- Notify each participant individually with personalized win/loss
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
        'You Won! 🎉',
        'You won ' || v_payout || ' chips! Result: ' || v_display_outcome,
        jsonb_build_object(
          'room_id', new.room_id,
          'bet_id', new.id,
          'won', true,
          'amount', v_payout,
          'outcome', new.outcome,
          'outcome_display', v_display_outcome
        )
      );
    ELSE
      PERFORM public.notify_users(
        'bet_lost',
        ARRAY[v_stake.user_id],
        'Better Luck Next Time',
        'You lost ' || v_stake.stake || ' chips. Result: ' || v_display_outcome,
        jsonb_build_object(
          'room_id', new.room_id,
          'bet_id', new.id,
          'won', false,
          'amount', v_stake.stake,
          'outcome', new.outcome,
          'outcome_display', v_display_outcome
        )
      );
    END IF;
  END LOOP;

  RETURN new;
END;
$$;
