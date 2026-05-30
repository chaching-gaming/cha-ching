-- Fix infinite recursion in bets/bet_stakes RLS policies
-- The issue: bets policy checks bet_stakes, which checks bets → infinite loop

-- ============================================================
-- 1. Helper function to check if user has stake in a bet (bypasses RLS)
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_has_stake_in_bet(p_bet_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.bet_stakes
    WHERE bet_id = p_bet_id AND user_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_has_stake_in_bet(uuid, uuid) TO authenticated;

-- ============================================================
-- 2. Helper function to get room_id from bet (bypasses RLS)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_bet_room_id(p_bet_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT room_id FROM public.bets WHERE id = p_bet_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_bet_room_id(uuid) TO authenticated;

-- ============================================================
-- 3. Fix bets policy - use helper function instead of direct subquery
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
    AND public.user_has_stake_in_bet(id, auth.uid())
  )
);

-- ============================================================
-- 4. Fix bet_stakes policy - use helper function instead of joining bets
-- ============================================================

DROP POLICY IF EXISTS "Room members can view bet stakes" ON public.bet_stakes;

CREATE POLICY "Room members can view bet stakes"
ON public.bet_stakes FOR SELECT
USING (
  -- Get the room_id via helper function (bypasses bets RLS)
  (
    public.is_room_member(public.get_bet_room_id(bet_id))
    OR
    (
      public.is_room_member_ever(public.get_bet_room_id(bet_id))
      AND user_id = auth.uid()
    )
  )
);
