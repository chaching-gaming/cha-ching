-- Soft delete for room_members: allow users to see past rooms they left/were removed from
-- Also enables rejoining with preserved chip balance

-- ============================================================
-- 1. Add columns for soft-delete tracking
-- ============================================================

ALTER TABLE public.room_members
  ADD COLUMN IF NOT EXISTS left_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS left_reason text DEFAULT NULL
    CHECK (left_reason IS NULL OR left_reason IN ('VOLUNTARY', 'REMOVED', 'ROOM_CLOSED'));

-- ============================================================
-- 2. Indexes for efficient queries
-- ============================================================

-- Index for separating active vs inactive members in a room
CREATE INDEX IF NOT EXISTS idx_room_members_left_at
  ON public.room_members(room_id, left_at);

-- Index for user's inactive memberships (for past rooms query)
CREATE INDEX IF NOT EXISTS idx_room_members_user_left
  ON public.room_members(user_id, left_at)
  WHERE left_at IS NOT NULL;

-- ============================================================
-- 3. Update is_room_member to check only ACTIVE members
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
      AND left_at IS NULL  -- Only active members
  );
$$;

-- ============================================================
-- 4. New helper: check if user was EVER a member (for read access to past rooms)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_room_member_ever(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.room_members
    WHERE room_id = p_room_id
      AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_room_member_ever(uuid) TO authenticated;

-- ============================================================
-- 5. New helper: check if user has active/unsettled bets in room
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_active_bets_in_room(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.bet_stakes bs
    JOIN public.bets b ON bs.bet_id = b.id
    WHERE bs.user_id = p_user_id
      AND b.room_id = p_room_id
      AND b.status IN ('OPEN', 'MATCHED', 'PENDING_RESULT', 'PENDING_DISPUTE', 'DISPUTED')
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_bets_in_room(uuid, uuid) TO authenticated;
