-- RPC to update room settings (admin only)
--
-- Allows room admin to update the outcome submission window duration.

CREATE OR REPLACE FUNCTION public.update_room_settings(
  p_room_id uuid,
  p_outcome_submission_window_seconds int DEFAULT NULL
)
RETURNS public.rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.rooms;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P1001';
  END IF;

  -- Check if user is admin of the room
  IF NOT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
      AND role = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'Only room admin can update settings' USING ERRCODE = 'P1002';
  END IF;

  -- Validate outcome submission window if provided
  IF p_outcome_submission_window_seconds IS NOT NULL THEN
    IF p_outcome_submission_window_seconds < 10 OR p_outcome_submission_window_seconds > 300 THEN
      RAISE EXCEPTION 'Outcome submission window must be between 10 and 300 seconds' USING ERRCODE = 'P1003';
    END IF;
  END IF;

  -- Update room settings
  UPDATE public.rooms
     SET outcome_submission_window_seconds = COALESCE(p_outcome_submission_window_seconds, outcome_submission_window_seconds)
   WHERE id = p_room_id
  RETURNING * INTO v_room;

  IF v_room IS NULL THEN
    RAISE EXCEPTION 'Room not found' USING ERRCODE = 'P1004';
  END IF;

  RETURN v_room;
END;
$$;

REVOKE ALL ON FUNCTION public.update_room_settings(uuid, int) FROM public;
GRANT EXECUTE ON FUNCTION public.update_room_settings(uuid, int) TO authenticated;
