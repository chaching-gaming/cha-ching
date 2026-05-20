import { useInfiniteQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

export type MyBet = {
  bet_id: string;
  room_id: string;
  room_name: string;
  question: string;
  my_pick: string;
  stake: number;
  outcome: string | null;
  won: boolean | null;
  chips_change: number | null;
  status: string;
  settled_at: string | null;
  created_at: string;
};

export type MyBetsStats = {
  totalBets: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number | null;
  netChips: number;
};

export const MY_BETS_PAGE_SIZE = 20;

export const myBetsKey = (roomId: string | null) => ['my-bets', roomId ?? 'all'] as const;

export function useMyBets(roomId?: string | null) {
  const { session } = useAuth();

  return useInfiniteQuery({
    queryKey: myBetsKey(roomId ?? null),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<MyBet[]> => {
      // Note: 'get_my_bets' RPC defined in migration 20260520000001_my_bets_rpc.sql
      // Types will be generated after migration is applied
      const { data, error } = await supabase.rpc('get_my_bets' as 'get_room_event_stats', {
        p_room_id: roomId ?? null,
        p_limit: MY_BETS_PAGE_SIZE,
        p_offset: pageParam,
      } as unknown as { p_room_id: string });
      if (error) throw error;
      return (data as unknown as MyBet[] | null) ?? [];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === MY_BETS_PAGE_SIZE
        ? allPages.length * MY_BETS_PAGE_SIZE
        : undefined,
    enabled: !!session?.user.id,
  });
}

/**
 * Calculate summary stats from the full list of bets.
 * Note: For accurate stats across all bets, you may need to fetch all pages
 * or implement a separate RPC for aggregate stats.
 */
export function calculateMyBetsStats(bets: MyBet[]): MyBetsStats {
  let wins = 0;
  let losses = 0;
  let pending = 0;
  let netChips = 0;

  for (const bet of bets) {
    if (bet.status === 'SETTLED') {
      if (bet.won === true) {
        wins++;
        netChips += bet.chips_change ?? 0;
      } else if (bet.won === false) {
        losses++;
        netChips += bet.chips_change ?? 0;
      }
    } else if (bet.status === 'VOID') {
      // Voided bets don't count toward wins/losses
    } else {
      // OPEN, MATCHED, etc.
      pending++;
    }
  }

  const totalSettled = wins + losses;
  const winRate = totalSettled > 0 ? Math.round((wins / totalSettled) * 100) : null;

  return {
    totalBets: bets.length,
    wins,
    losses,
    pending,
    winRate,
    netChips,
  };
}
