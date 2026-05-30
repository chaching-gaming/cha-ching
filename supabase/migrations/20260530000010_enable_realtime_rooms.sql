-- Enable realtime on rooms table
--
-- This allows clients to subscribe to room status changes (e.g., when a session ends).
-- Without this, the useRealtimeHistoryRooms hook in the Profile screen cannot detect
-- when is_active changes from true to false, so the "Rejoin" button doesn't hide
-- in realtime when an admin ends a session.

ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
