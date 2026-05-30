-- Update RLS policies to handle soft-deleted memberships
-- Active members see everything, past members have limited visibility

-- ============================================================
-- 1. Rooms table - Allow viewing past rooms
-- ============================================================

DROP POLICY IF EXISTS "Members can view rooms" ON public.rooms;

CREATE POLICY "Members can view rooms"
ON public.rooms FOR SELECT
USING (
  -- Users can view rooms they are or were members of
  public.is_room_member_ever(id)
  OR
  -- Anyone can view active rooms (for joining via invite code)
  is_active = true
);

-- ============================================================
-- 2. Room members - Tiered visibility
-- ============================================================

DROP POLICY IF EXISTS "View room members" ON public.room_members;

CREATE POLICY "View room members"
ON public.room_members FOR SELECT
USING (
  -- Active members see all members (active + inactive)
  public.is_room_member(room_id)
  OR
  -- Inactive members see only themselves
  (user_id = auth.uid() AND public.is_room_member_ever(room_id))
);

-- ============================================================
-- 3. Bets - Past members see only their bets
-- ============================================================

DROP POLICY IF EXISTS "Room members can view bets" ON public.bets;

CREATE POLICY "Room members can view bets"
ON public.bets FOR SELECT
USING (
  -- Active members see all bets
  public.is_room_member(room_id)
  OR
  -- Past members see only bets they participated in
  (
    public.is_room_member_ever(room_id)
    AND EXISTS(
      SELECT 1 FROM public.bet_stakes bs
      WHERE bs.bet_id = bets.id AND bs.user_id = auth.uid()
    )
  )
);

-- ============================================================
-- 4. Bet stakes - Match bets visibility
-- ============================================================

DROP POLICY IF EXISTS "Room members can view bet stakes" ON public.bet_stakes;

CREATE POLICY "Room members can view bet stakes"
ON public.bet_stakes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.bets b
    WHERE b.id = bet_stakes.bet_id
      AND (
        -- Active members see all bet stakes
        public.is_room_member(b.room_id)
        OR
        -- Past members see only their own stakes
        (public.is_room_member_ever(b.room_id) AND bet_stakes.user_id = auth.uid())
      )
  )
);

-- ============================================================
-- 5. Chip requests - Past members see only their requests
-- ============================================================

DROP POLICY IF EXISTS "Room members can view chip requests" ON public.chip_requests;

CREATE POLICY "Room members can view chip requests"
ON public.chip_requests FOR SELECT
USING (
  -- Active members see all requests
  public.is_room_member(room_id)
  OR
  -- Past members see only their own requests
  (requested_by = auth.uid() AND public.is_room_member_ever(room_id))
);

-- ============================================================
-- 6. Update prune_excess_inactive_rooms to count only active members
-- ============================================================

-- Note: The existing prune function operates on rooms table by created_by,
-- not room_members, so it doesn't need changes for soft-delete.
-- Room deletion will cascade to room_members (both active and inactive).
