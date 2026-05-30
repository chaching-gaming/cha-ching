-- Fix: end_session should mark all active members as left with reason 'ROOM_CLOSED'
-- This ensures ended rooms appear in past rooms for all members

CREATE OR REPLACE FUNCTION public.end_session(p_room_id uuid)
RETURNS public.rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_room public.rooms;
BEGIN
  -- Check caller is admin of this room
  IF NOT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id
      AND user_id = v_user_id
      AND role = 'ADMIN'
      AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Only the room admin can end the session';
  END IF;

  -- Mark all active members as left with reason 'ROOM_CLOSED'
  UPDATE public.room_members
  SET left_at = now(), left_reason = 'ROOM_CLOSED'
  WHERE room_id = p_room_id
    AND left_at IS NULL;

  -- End the session
  UPDATE public.rooms
  SET is_active = false, ended_at = now()
  WHERE id = p_room_id
  RETURNING * INTO v_room;

  RETURN v_room;
END;
$$;
