-- Add notification for new bet creation
-- Notifies all room members (except the creator) when a new bet is posted

-- ============================================================
-- 1. Update notification type constraint to include bet_created
-- ============================================================

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'bet_matched', 'bet_settled', 'bet_won', 'bet_lost', 'bet_voided',
    'bet_disputed', 'bet_expiring', 'chip_request_created', 'chip_donated',
    'bet_accepted', 'bet_created'
  ));

-- ============================================================
-- 2. Trigger: on_bet_created
-- ============================================================
-- When a new bet is inserted, notify all room members except the creator

CREATE OR REPLACE FUNCTION public.trigger_bet_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_members uuid[];
  v_creator_name text;
  v_room_name text;
BEGIN
  -- Get creator's display name
  SELECT display_name INTO v_creator_name
  FROM public.profiles
  WHERE id = new.offered_by;

  -- Get room name
  SELECT name INTO v_room_name
  FROM public.rooms
  WHERE id = new.room_id;

  -- Get all room members except the creator
  SELECT array_agg(user_id) INTO v_room_members
  FROM public.room_members
  WHERE room_id = new.room_id
    AND user_id IS DISTINCT FROM new.offered_by;

  IF v_room_members IS NOT NULL AND array_length(v_room_members, 1) > 0 THEN
    PERFORM public.notify_users(
      'bet_created',
      v_room_members,
      'New Bet Posted',
      coalesce(v_creator_name, 'Someone') || ' posted: "' || left(new.question, 50) || '"',
      jsonb_build_object(
        'room_id', new.room_id,
        'bet_id', new.id,
        'room_name', v_room_name,
        'creator_name', v_creator_name
      )
    );
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_bet_created ON public.bets;
CREATE TRIGGER on_bet_created
AFTER INSERT ON public.bets
FOR EACH ROW
EXECUTE FUNCTION public.trigger_bet_created();
