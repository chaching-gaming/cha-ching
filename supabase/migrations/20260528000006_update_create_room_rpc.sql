-- Update create_room RPC to accept outcome_submission_window_seconds parameter
--
-- Allows room creators to configure the outcome submission window duration.

-- Drop old function signatures first
DROP FUNCTION IF EXISTS public.create_room(text, date, int);

CREATE OR REPLACE FUNCTION public.create_room(
  p_name text,
  p_session_date date,
  p_starting_chips int DEFAULT 1000,
  p_outcome_submission_window_seconds int DEFAULT 30
)
RETURNS public.rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite_code text;
  v_room public.rooms;
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_exists boolean;
  v_starting int;
  v_window_seconds int;
  v_full_name text;
BEGIN
  -- Validate starting chips
  v_starting := coalesce(p_starting_chips, 1000);
  IF v_starting <= 0 OR v_starting > 100000 THEN
    RAISE EXCEPTION 'Starting chips must be between 1 and 100,000' USING ERRCODE = 'P0004';
  END IF;

  -- Validate outcome submission window
  v_window_seconds := coalesce(p_outcome_submission_window_seconds, 30);
  IF v_window_seconds < 10 OR v_window_seconds > 300 THEN
    RAISE EXCEPTION 'Outcome submission window must be between 10 and 300 seconds' USING ERRCODE = 'P0005';
  END IF;

  -- Build session name: user-provided name + date
  v_full_name := p_name || ' - ' || to_char(p_session_date, 'YYYY-MM-DD');

  -- Generate unique 6-char invite code
  LOOP
    v_invite_code := '';
    FOR i IN 1..6 LOOP
      v_invite_code := v_invite_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;

    SELECT exists(SELECT 1 FROM public.rooms WHERE invite_code = v_invite_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;

  -- Insert room with starting_chips and outcome_submission_window_seconds
  INSERT INTO public.rooms (name, invite_code, created_by, starting_chips, per_user_chip_limit, session_date, is_active, outcome_submission_window_seconds)
  VALUES (v_full_name, v_invite_code, auth.uid(), v_starting, null, p_session_date, true, v_window_seconds)
  RETURNING * INTO v_room;

  -- Insert creator as ADMIN member
  INSERT INTO public.room_members (room_id, user_id, role)
  VALUES (v_room.id, auth.uid(), 'ADMIN');

  RETURN v_room;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_room(text, date, int, int) TO authenticated;
