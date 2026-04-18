import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Database } from '@cha-ching/types';
import { useAuth } from '@/providers/auth';

/** Supabase reuses `channel(topic)` if that topic is still registered; topics must be unique per subscription. */
function realtimeTopicToken(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}-${Math.random().toString(36).slice(2, 11)}`;
}

type Bet = Database['public']['Tables']['bets']['Row'];
type ChipRequest = Database['public']['Tables']['chip_requests']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];
export type OutcomeSubmission = Database['public']['Tables']['outcome_submissions']['Row'];

export type BetWithProfiles = Bet & {
  offered_by_profile: Profile | null;
  accepted_by_profile: Profile | null;
  outcome_submissions: OutcomeSubmission[];
};

export type ChipRequestWithProfile = ChipRequest & {
  requested_by_profile: Profile | null;
};

export type ActivityItem =
  | { type: 'bet'; timestamp: string; bet: BetWithProfiles }
  | { type: 'chip_request'; timestamp: string; chipRequest: ChipRequestWithProfile };

export const roomBetsKey = (roomId: string) => ['rooms', roomId, 'bets'] as const;
const roomChipRequestsKey = (roomId: string) => ['rooms', roomId, 'chip_requests'] as const;
export const roomBalanceKey = (roomId: string) => ['rooms', roomId, 'balance'] as const;

export function useRoomBets(roomId: string) {
  const { session } = useAuth();

  return useQuery({
    queryKey: roomBetsKey(roomId),
    queryFn: async (): Promise<BetWithProfiles[]> => {
      const { data, error } = await supabase
        .from('bets')
        .select(
          '*, offered_by_profile:profiles!bets_offered_by_fkey(*), accepted_by_profile:profiles!bets_accepted_by_fkey(*), outcome_submissions(*)',
        )
        .eq('room_id', roomId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as BetWithProfiles[];
    },
    enabled: !!session?.user.id && !!roomId,
  });
}

export const betDetailKey = (betId: string) => ['bets', betId] as const;

export function useBetDetail(betId: string) {
  const { session } = useAuth();

  return useQuery({
    queryKey: betDetailKey(betId),
    queryFn: async (): Promise<BetWithProfiles> => {
      const { data, error } = await supabase
        .from('bets')
        .select(
          '*, offered_by_profile:profiles!bets_offered_by_fkey(*), accepted_by_profile:profiles!bets_accepted_by_fkey(*), outcome_submissions(*)',
        )
        .eq('id', betId)
        .single();

      if (error) throw error;
      return data as unknown as BetWithProfiles;
    },
    enabled: !!session?.user.id && !!betId,
  });
}

export function useRoomChipRequests(roomId: string) {
  const { session } = useAuth();

  return useQuery({
    queryKey: roomChipRequestsKey(roomId),
    queryFn: async (): Promise<ChipRequestWithProfile[]> => {
      const { data, error } = await supabase
        .from('chip_requests')
        .select('*, requested_by_profile:profiles!chip_requests_requested_by_fkey(*)')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as ChipRequestWithProfile[];
    },
    enabled: !!session?.user.id && !!roomId,
  });
}

export function useMyRoomBalance(roomId: string) {
  const { session } = useAuth();

  return useQuery({
    queryKey: roomBalanceKey(roomId),
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('get_my_room_balance', { p_room_id: roomId });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    enabled: !!session?.user.id && !!roomId,
  });
}

export function useRoomActivityFeed(roomId: string) {
  const { data: bets, isLoading: betsLoading } = useRoomBets(roomId);
  const { data: chipRequests, isLoading: chipRequestsLoading } = useRoomChipRequests(roomId);

  const items = useMemo((): ActivityItem[] => {
    const feed: ActivityItem[] = [];

    if (bets) {
      for (const bet of bets) {
        feed.push({ type: 'bet', timestamp: bet.created_at ?? '', bet });
      }
    }

    if (chipRequests) {
      for (const cr of chipRequests) {
        feed.push({ type: 'chip_request', timestamp: cr.created_at ?? '', chipRequest: cr });
      }
    }

    feed.sort((a, b) => (b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0));

    return feed;
  }, [bets, chipRequests]);

  return { data: items, isLoading: betsLoading || chipRequestsLoading };
}

export function useRealtimeActivityFeed(roomId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!roomId) return;

    // Drop any legacy single-topic channel from older app versions / hot reload.
    // `RealtimeClient.channel()` returns the *existing* instance while it is still
    // registered; a new `.on(postgres_changes)` then throws if that channel is
    // already joining or joined.
    const legacyTopic = `realtime:room-${roomId}-activity`;
    for (const ch of [...supabase.getChannels()]) {
      if (ch.topic === legacyTopic) {
        void supabase.removeChannel(ch);
      }
    }

    const token = realtimeTopicToken();
    // One channel per postgres_changes listener; never reuse a stable topic string.
    const betsChannel = supabase
      .channel(`cc-feed:${roomId}:bets:${token}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bets', filter: `room_id=eq.${roomId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: roomBetsKey(roomId) });
          queryClient.invalidateQueries({ queryKey: roomBalanceKey(roomId) });
        },
      )
      .subscribe();

    const chipRequestsChannel = supabase
      .channel(`cc-feed:${roomId}:chips:${token}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chip_requests',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: roomChipRequestsKey(roomId) });
          queryClient.invalidateQueries({ queryKey: roomBalanceKey(roomId) });
        },
      )
      .subscribe();

    // outcome_submissions has no room_id column, so we can't server-filter.
    // Traffic is low (≤2 rows per bet); client-side invalidation handles the over-fetch.
    const outcomeSubmissionsChannel = supabase
      .channel(`cc-feed:${roomId}:outcomes:${token}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'outcome_submissions' },
        () => {
          queryClient.invalidateQueries({ queryKey: roomBetsKey(roomId) });
        },
      )
      .subscribe();

    return () => {
      void (async () => {
        await supabase.removeChannel(betsChannel);
        await supabase.removeChannel(chipRequestsChannel);
        await supabase.removeChannel(outcomeSubmissionsChannel);
      })();
    };
  }, [roomId, queryClient]);
}
