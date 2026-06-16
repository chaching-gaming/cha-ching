import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

export type MemberStats = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string | null;
  left_at: string | null;
  left_reason: string | null;
  balance: number;
  starting_chips: number;
  chips_donated: number;
  donation_count: number;
  chips_received: number;
  received_count: number;
};

export const memberStatsKey = (roomId: string, userId: string) =>
  ['rooms', roomId, 'member-stats', userId] as const;

export function useMemberStats(roomId: string | null, userId: string | null) {
  const { session } = useAuth();

  return useQuery({
    queryKey: memberStatsKey(roomId ?? '', userId ?? ''),
    queryFn: async (): Promise<MemberStats | null> => {
      if (!roomId || !userId) return null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('get_member_stats', {
        p_room_id: roomId,
        p_user_id: userId,
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : null;
      if (!row) return null;

      return {
        user_id: row.user_id as string,
        display_name: row.display_name as string | null,
        avatar_url: row.avatar_url as string | null,
        role: row.role as string | null,
        left_at: row.left_at as string | null,
        left_reason: row.left_reason as string | null,
        balance: Number(row.balance) || 0,
        starting_chips: Number(row.starting_chips) || 0,
        chips_donated: Number(row.chips_donated) || 0,
        donation_count: Number(row.donation_count) || 0,
        chips_received: Number(row.chips_received) || 0,
        received_count: Number(row.received_count) || 0,
      };
    },
    enabled: !!session?.user.id && !!roomId && !!userId,
  });
}
