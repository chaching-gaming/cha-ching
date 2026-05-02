import { useInfiniteQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

export type NotificationType =
  | 'bet_matched'
  | 'bet_settled'
  | 'bet_disputed'
  | 'bet_expiring'
  | 'chip_request_created'
  | 'chip_donated'
  | 'bet_accepted';

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: {
    room_id?: string;
    bet_id?: string;
    chip_request_id?: string;
  };
  read_at: string | null;
  created_at: string;
};

export const NOTIFICATIONS_PAGE_SIZE = 20;

export const notificationsKey = () => ['notifications'] as const;

export function useNotificationsFeed() {
  const { session } = useAuth();

  return useInfiniteQuery({
    queryKey: notificationsKey(),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<NotificationRow[]> => {
      const { data, error } = await supabase.rpc('get_notifications', {
        p_limit: NOTIFICATIONS_PAGE_SIZE,
        p_offset: pageParam,
      });
      if (error) throw error;
      return (data as unknown as NotificationRow[] | null) ?? [];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === NOTIFICATIONS_PAGE_SIZE
        ? allPages.length * NOTIFICATIONS_PAGE_SIZE
        : undefined,
    enabled: !!session?.user.id,
  });
}
