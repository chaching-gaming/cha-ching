import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

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
export const myBetsStatsKey = (roomId: string | null) => ['my-bets-stats', roomId ?? 'all'] as const;

// Aggregate stats from backend RPC (accurate across all bets, not just loaded pages)
export type MyBetsAggregateStats = {
  total_bets: number;
  wins: number;
  losses: number;
  net_chips: number;
};

export function useMyBets(roomId?: string | null) {
  const { session } = useAuth();

  return useInfiniteQuery({
    queryKey: myBetsKey(roomId ?? null),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<MyBet[]> => {
      // Note: 'get_my_bets' RPC defined in migration 20260520000001_my_bets_rpc.sql
      // Types will be generated after migration is applied
      // When roomId is null/undefined, omit p_room_id to let PostgreSQL use DEFAULT NULL
      const params: Record<string, unknown> = {
        p_limit: MY_BETS_PAGE_SIZE,
        p_offset: pageParam,
      };
      // Only include p_room_id when we have a specific room
      if (roomId) {
        params.p_room_id = roomId;
      }
      const { data, error } = await supabase.rpc(
        'get_my_bets' as 'get_room_event_stats',
        params as unknown as { p_room_id: string },
      );
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
 * Fetch aggregate stats for My Bets from backend RPC.
 * This is accurate across ALL bets, not just loaded pages.
 */
export function useMyBetsAggregateStats(roomId?: string | null) {
  const { session } = useAuth();

  return useQuery({
    queryKey: myBetsStatsKey(roomId ?? null),
    queryFn: async (): Promise<MyBetsAggregateStats | null> => {
      // Build params - omit p_room_id when null to use PostgreSQL DEFAULT
      const params: Record<string, unknown> = {};
      if (roomId) {
        params.p_room_id = roomId;
      }
      const { data, error } = await supabase.rpc(
        'get_my_bets_aggregate_stats' as 'get_room_event_stats',
        params as unknown as { p_room_id: string },
      );
      if (error) throw error;
      const row = Array.isArray(data) ? (data[0] as MyBetsAggregateStats | undefined) : null;
      return row ?? null;
    },
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
