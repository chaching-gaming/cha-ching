-- Enable Realtime on room_members for live member updates.
-- When someone joins/leaves a room, all members see it instantly.

-- Set REPLICA IDENTITY FULL so DELETE events include the old row data.
-- This allows us to know which user_id was removed.
alter table public.room_members replica identity full;

alter publication supabase_realtime add table public.room_members;
