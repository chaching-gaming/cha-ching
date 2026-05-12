-- Enable realtime for notifications table
-- This allows the mobile app to receive instant updates when new notifications arrive

-- Add notifications table to realtime publication
alter publication supabase_realtime add table public.notifications;

-- Set replica identity to full so we get all column data in realtime events
alter table public.notifications replica identity full;
