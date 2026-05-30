-- Simplify bet_stakes policy: users can ALWAYS see their own stakes
-- This fixes the issue where past members can't see bets in room detail

DROP POLICY IF EXISTS "Room members can view bet stakes" ON public.bet_stakes;

CREATE POLICY "Room members can view bet stakes"
ON public.bet_stakes FOR SELECT
USING (
  -- Users can always see their own stakes (primary fix for past members)
  user_id = auth.uid()
  OR
  -- Active room members can see all stakes in their rooms
  public.is_room_member(public.get_bet_room_id(bet_id))
);
