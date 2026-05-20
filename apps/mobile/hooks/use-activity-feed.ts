import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Database } from '@cha-ching/types';
import { useAuth } from '@/providers/auth';
import { roomDetailKey, roomMembersKey } from './use-rooms';

/** Supabase reuses `channel(topic)` if that topic is still registered; topics must be unique per subscription. */
function realtimeTopicToken(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}-${Math.random().toString(36).slice(2, 11)}`;
}

type Bet = Database['public']['Tables']['bets']['Row'];
type BetStake = Database['public']['Tables']['bet_stakes']['Row'];
type BetVoidLog = Database['public']['Tables']['bet_void_logs']['Row'];
type ChipRequest = Database['public']['Tables']['chip_requests']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];
export type OutcomeSubmission = Database['public']['Tables']['outcome_submissions']['Row'];

export type BetStakeWithProfile = BetStake & {
  user: Profile | null;
};

export type BetVoidLogWithProfile = BetVoidLog & {
  voided_by_profile: Profile | null;
};

export type BetWithProfiles = Bet & {
  offered_by_profile: Profile | null;
  subject_profile: Profile | null;
  outcome_submissions: OutcomeSubmission[];
  stakes: BetStakeWithProfile[];
  /** Populated only for admins (RLS-gated). Empty for non-admins or non-void bets. */
  void_logs: BetVoidLogWithProfile[];
};

export type ChipRequestWithProfile = ChipRequest & {
  requested_by_profile: Profile | null;
};

export type ActivityItem =
  | { type: 'bet'; timestamp: string; bet: BetWithProfiles }
  | { type: 'chip_request'; timestamp: string; chipRequest: ChipRequestWithProfile };

/** Invalidate to refresh the rooms list (used for balance updates visible on the list page). */
const ROOMS_ACTIVE_KEY = ['rooms', 'active'] as const;
const ROOMS_HISTORY_KEY = ['rooms', 'history'] as const;

export const roomBetsKey = (roomId: string) => ['rooms', roomId, 'bets'] as const;
export const roomChipRequestsKey = (roomId: string) => ['rooms', roomId, 'chip_requests'] as const;
export const roomBalanceKey = (roomId: string) => ['rooms', roomId, 'balance'] as const;
export const roomMemberBalancesKey = (roomId: string) =>
  ['rooms', roomId, 'member-balances'] as const;

export type RoomMemberBalance = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  balance: number;
  wins: number;
  losses: number;
};

export function useRoomBets(roomId: string) {
  const { session } = useAuth();

  return useQuery({
    queryKey: roomBetsKey(roomId),
    queryFn: async (): Promise<BetWithProfiles[]> => {
      const { data, error } = await supabase
        .from('bets')
        .select(
          '*, offered_by_profile:profiles!bets_offered_by_fkey(*), subject_profile:profiles!bets_subject_user_id_fkey(*), outcome_submissions(*), stakes:bet_stakes(*, user:profiles!bet_stakes_user_id_fkey(*)), void_logs:bet_void_logs(*, voided_by_profile:profiles!bet_void_logs_voided_by_fkey(*))',
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
          '*, offered_by_profile:profiles!bets_offered_by_fkey(*), subject_profile:profiles!bets_subject_user_id_fkey(*), outcome_submissions(*), stakes:bet_stakes(*, user:profiles!bet_stakes_user_id_fkey(*)), void_logs:bet_void_logs(*, voided_by_profile:profiles!bet_void_logs_voided_by_fkey(*))',
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

export function useRoomMemberBalances(roomId: string) {
  const { session } = useAuth();

  return useQuery({
    queryKey: roomMemberBalancesKey(roomId),
    queryFn: async (): Promise<RoomMemberBalance[]> => {
      const { data, error } = await supabase.rpc('get_room_member_balances', {
        p_room_id: roomId,
      });
      if (error) throw error;
      return (data as RoomMemberBalance[] | null) ?? [];
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

type RealtimeActivityFeedOptions = {
  /** Called when the current user is removed from the room */
  onCurrentUserRemoved?: () => void;
};

/**
 * Creates a debounced invalidation function that batches rapid query invalidations.
 * This prevents UI freezes when multiple realtime events arrive in quick succession
 * (e.g., bet settlement creates multiple ledger entries).
 */
function createDebouncedInvalidator(queryClient: QueryClient, delay = 150) {
  const pendingKeys = new Set<string>();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (queryKey: readonly unknown[]) => {
    const keyStr = JSON.stringify(queryKey);
    pendingKeys.add(keyStr);

    if (timeoutId) clearTimeout(timeoutId);

    timeoutId = setTimeout(() => {
      for (const key of pendingKeys) {
        queryClient.invalidateQueries({ queryKey: JSON.parse(key) });
      }
      pendingKeys.clear();
      timeoutId = null;
    }, delay);
  };
}

export function useRealtimeActivityFeed(
  roomId: string,
  options?: RealtimeActivityFeedOptions,
) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const currentUserId = session?.user.id;

  // Create a stable debounced invalidator to batch rapid realtime events
  const invalidatorRef = useRef<ReturnType<typeof createDebouncedInvalidator> | null>(null);
  if (!invalidatorRef.current) {
    invalidatorRef.current = createDebouncedInvalidator(queryClient);
  }
  const invalidate = invalidatorRef.current;

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
          invalidate(roomBetsKey(roomId));
          invalidate(roomBalanceKey(roomId));
          invalidate(roomMemberBalancesKey(roomId));
          // Also update rooms list so balance shows correctly on the list page
          invalidate(ROOMS_ACTIVE_KEY);
          invalidate(ROOMS_HISTORY_KEY);
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
          invalidate(roomChipRequestsKey(roomId));
          invalidate(roomBalanceKey(roomId));
          invalidate(roomMemberBalancesKey(roomId));
          // Also update rooms list so balance shows correctly on the list page
          invalidate(ROOMS_ACTIVE_KEY);
          invalidate(ROOMS_HISTORY_KEY);
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
          invalidate(roomBetsKey(roomId));
        },
      )
      .subscribe();

    // bet_stakes also has no room_id column; same client-side invalidation.
    // Drives per-side tallies, subject-rule UI, and "you joined" celebration.
    const betStakesChannel = supabase
      .channel(`cc-feed:${roomId}:stakes:${token}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bet_stakes' }, () => {
        invalidate(roomBetsKey(roomId));
        invalidate(roomBalanceKey(roomId));
        invalidate(roomMemberBalancesKey(roomId));
        // Also update rooms list so balance shows correctly on the list page
        invalidate(ROOMS_ACTIVE_KEY);
        invalidate(ROOMS_HISTORY_KEY);
      })
      .subscribe();

    // room_members: see when someone joins/leaves the room, or balance changes (chip donations).
    const roomMembersChannel = supabase
      .channel(`cc-feed:${roomId}:members:${token}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_members',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          invalidate(roomMembersKey(roomId));
          invalidate(roomDetailKey(roomId));
          invalidate(roomMemberBalancesKey(roomId));
          // Invalidate current user's balance (for chip donations received)
          invalidate(roomBalanceKey(roomId));
          // Update rooms list so balance shows correctly on the list page
          invalidate(ROOMS_ACTIVE_KEY);
          invalidate(ROOMS_HISTORY_KEY);

          // If the current user was removed, notify via callback (immediate, not debounced)
          if (
            payload.eventType === 'DELETE' &&
            payload.old &&
            (payload.old as { user_id?: string }).user_id === currentUserId
          ) {
            options?.onCurrentUserRemoved?.();
          }
        },
      )
      .subscribe();

    // ledger_entries: balance changes from chip donations, bet settlements, etc.
    // This is the source of truth for balances, so we must watch it.
    const ledgerEntriesChannel = supabase
      .channel(`cc-feed:${roomId}:ledger:${token}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ledger_entries',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          invalidate(roomBalanceKey(roomId));
          invalidate(roomMemberBalancesKey(roomId));
          // Update rooms list so balance shows correctly on the list page
          invalidate(ROOMS_ACTIVE_KEY);
          invalidate(ROOMS_HISTORY_KEY);
        },
      )
      .subscribe();

    return () => {
      void (async () => {
        await supabase.removeChannel(betsChannel);
        await supabase.removeChannel(chipRequestsChannel);
        await supabase.removeChannel(outcomeSubmissionsChannel);
        await supabase.removeChannel(betStakesChannel);
        await supabase.removeChannel(roomMembersChannel);
        await supabase.removeChannel(ledgerEntriesChannel);
      })();
    };
  }, [roomId, queryClient, currentUserId, options]);
}
