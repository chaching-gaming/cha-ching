-- Update membership RPCs to use soft-delete instead of hard delete
-- Also adds active bet check before allowing leave

-- ============================================================
-- 1. Update leave_room RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.leave_room(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_role text;
  v_admin_count int;
  v_already_left boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING errcode = 'P0301';
  END IF;

  SELECT role, (left_at IS NOT NULL) INTO v_my_role, v_already_left
  FROM public.room_members
  WHERE room_id = p_room_id AND user_id = auth.uid();

  IF v_my_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this room' USING errcode = 'P0006';
  END IF;

  IF v_already_left THEN
    RAISE EXCEPTION 'You have already left this room' USING errcode = 'P0006';
  END IF;

  -- Check for active bets - BLOCK leaving if user has unsettled bets
  IF public.has_active_bets_in_room(p_room_id, auth.uid()) THEN
    RAISE EXCEPTION 'Cannot leave room while you have active bets. Wait for all bets to settle.'
      USING errcode = 'P0009';
  END IF;

  -- If the user is an admin, ensure they're not the last one
  IF v_my_role = 'ADMIN' THEN
    SELECT count(*)::int INTO v_admin_count
    FROM public.room_members
    WHERE room_id = p_room_id AND role = 'ADMIN' AND left_at IS NULL;

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot leave as the last admin. Transfer admin role to another member first.'
        USING errcode = 'P0008';
    END IF;
  END IF;

  -- Soft delete: set left_at timestamp and reason
  UPDATE public.room_members
  SET left_at = now(), left_reason = 'VOLUNTARY'
  WHERE room_id = p_room_id AND user_id = auth.uid();
END;
$$;

-- ============================================================
-- 2. Update remove_member RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.remove_member(
  p_room_id uuid,
  p_target_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_target_role text;
  v_admin_count int;
  v_already_left boolean;
BEGIN
  -- Check if caller is an active admin
  SELECT EXISTS(
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
      AND role = 'ADMIN'
      AND left_at IS NULL
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only an admin can remove members' USING errcode = 'P0005';
  END IF;

  SELECT role, (left_at IS NOT NULL) INTO v_target_role, v_already_left
  FROM public.room_members
  WHERE room_id = p_room_id AND user_id = p_target_user_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not a member of this session' USING errcode = 'P0006';
  END IF;

  IF v_already_left THEN
    RAISE EXCEPTION 'Target user has already left this session' USING errcode = 'P0006';
  END IF;

  IF v_target_role = 'ADMIN' THEN
    SELECT count(*)::int INTO v_admin_count
    FROM public.room_members
    WHERE room_id = p_room_id AND role = 'ADMIN' AND left_at IS NULL;

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last admin from the session' USING errcode = 'P0008';
    END IF;
  END IF;

  -- Note: Admin CAN remove members even if they have active bets
  -- This is a deliberate design choice - admin has authority to remove bad actors
  -- User's chips remain frozen (ledger intact) for potential rejoin

  -- Soft delete: set left_at timestamp and reason
  UPDATE public.room_members
  SET left_at = now(), left_reason = 'REMOVED'
  WHERE room_id = p_room_id AND user_id = p_target_user_id;
END;
$$;

-- ============================================================
-- 3. Update join_room_via_invite RPC (handle rejoin)
-- ============================================================

CREATE OR REPLACE FUNCTION public.join_room_via_invite(
  p_invite_code text
)
RETURNS public.rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.rooms;
  v_existing_member record;
BEGIN
  -- Find room by invite code (normalize input)
  SELECT * INTO v_room
  FROM public.rooms
  WHERE invite_code = upper(trim(p_invite_code));

  IF v_room IS NULL THEN
    RAISE EXCEPTION 'Room not found' USING errcode = 'P0001';
  END IF;

  IF NOT v_room.is_active THEN
    RAISE EXCEPTION 'Session is no longer active' USING errcode = 'P0002';
  END IF;

  -- Check for existing membership (including soft-deleted)
  SELECT id, left_at, left_reason INTO v_existing_member
  FROM public.room_members
  WHERE room_id = v_room.id AND user_id = auth.uid();

  IF v_existing_member.id IS NOT NULL THEN
    IF v_existing_member.left_at IS NULL THEN
      -- Active member - already in the room
      RAISE EXCEPTION 'Already a member' USING errcode = 'P0003';
    ELSE
      -- Previously left - allow rejoin by clearing left_at
      -- IMPORTANT: Keep original joined_at and don't grant new chips
      -- The unique index on GRANT ledger entries handles chip idempotency
      UPDATE public.room_members
      SET left_at = NULL,
          left_reason = NULL,
          role = 'PLAYER'  -- Reset to PLAYER on rejoin
      WHERE id = v_existing_member.id;

      RETURN v_room;
    END IF;
  END IF;

  -- New member - insert record (triggers grant_starting_chips)
  INSERT INTO public.room_members (room_id, user_id, role)
  VALUES (v_room.id, auth.uid(), 'PLAYER');

  RETURN v_room;
END;
$$;

-- ============================================================
-- 4. Update update_member_role RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_member_role(
  p_room_id uuid,
  p_target_user_id uuid,
  p_new_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_current_role text;
  v_admin_count int;
  v_already_left boolean;
BEGIN
  IF p_new_role IS NULL OR p_new_role NOT IN ('PLAYER', 'ATTESTOR', 'ADMIN') THEN
    RAISE EXCEPTION 'Invalid role' USING errcode = 'P0007';
  END IF;

  -- Check if caller is an active admin
  SELECT EXISTS(
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
      AND role = 'ADMIN'
      AND left_at IS NULL
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only an admin can change member roles' USING errcode = 'P0005';
  END IF;

  SELECT role, (left_at IS NOT NULL) INTO v_current_role, v_already_left
  FROM public.room_members
  WHERE room_id = p_room_id AND user_id = p_target_user_id;

  IF v_current_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not a member of this session' USING errcode = 'P0006';
  END IF;

  IF v_already_left THEN
    RAISE EXCEPTION 'Cannot change role of a member who has left' USING errcode = 'P0006';
  END IF;

  -- Cannot demote the last admin
  IF v_current_role = 'ADMIN' AND p_new_role <> 'ADMIN' THEN
    SELECT count(*)::int INTO v_admin_count
    FROM public.room_members
    WHERE room_id = p_room_id AND role = 'ADMIN' AND left_at IS NULL;

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last admin role from the session' USING errcode = 'P0008';
    END IF;
  END IF;

  UPDATE public.room_members
  SET role = p_new_role
  WHERE room_id = p_room_id AND user_id = p_target_user_id;
END;
$$;

-- ============================================================
-- 5. Update reassign_admin RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.reassign_admin(
  p_room_id uuid,
  p_new_admin_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_target_exists boolean;
  v_target_left boolean;
BEGIN
  -- Check if caller is an active admin
  SELECT EXISTS(
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
      AND role = 'ADMIN'
      AND left_at IS NULL
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only the admin can reassign admin role' USING errcode = 'P0005';
  END IF;

  SELECT
    EXISTS(SELECT 1 FROM public.room_members
           WHERE room_id = p_room_id AND user_id = p_new_admin_user_id),
    EXISTS(SELECT 1 FROM public.room_members
           WHERE room_id = p_room_id AND user_id = p_new_admin_user_id AND left_at IS NOT NULL)
  INTO v_target_exists, v_target_left;

  IF NOT v_target_exists THEN
    RAISE EXCEPTION 'Target user is not a member of this session' USING errcode = 'P0006';
  END IF;

  IF v_target_left THEN
    RAISE EXCEPTION 'Cannot reassign admin role to a member who has left' USING errcode = 'P0006';
  END IF;

  -- Demote current admin to PLAYER
  UPDATE public.room_members
  SET role = 'PLAYER'
  WHERE room_id = p_room_id AND user_id = auth.uid();

  -- Promote new admin
  UPDATE public.room_members
  SET role = 'ADMIN'
  WHERE room_id = p_room_id AND user_id = p_new_admin_user_id;
END;
$$;

-- ============================================================
-- 6. Update end_session RPC to check active membership
-- ============================================================

CREATE OR REPLACE FUNCTION public.end_session(
  p_room_id uuid
)
RETURNS public.rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.rooms;
  v_is_admin boolean;
BEGIN
  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;

  IF v_room IS NULL THEN
    RAISE EXCEPTION 'Session not found' USING errcode = 'P0001';
  END IF;

  IF NOT v_room.is_active THEN
    RAISE EXCEPTION 'Session is already ended' USING errcode = 'P0004';
  END IF;

  -- Verify caller is an active admin
  SELECT EXISTS(
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
      AND role = 'ADMIN'
      AND left_at IS NULL
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only the admin can end a session' USING errcode = 'P0005';
  END IF;

  UPDATE public.rooms
  SET is_active = false, ended_at = now()
  WHERE id = p_room_id
  RETURNING * INTO v_room;

  RETURN v_room;
END;
$$;
