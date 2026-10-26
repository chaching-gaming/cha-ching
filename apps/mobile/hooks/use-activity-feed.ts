import { useEffect, useMemo, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import {
  useQuery,
  useInfiniteQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Database } from '@cha-ching/types';
import type { RealtimeChannel } from '@supabase/supabase-js';
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

export type SettlementStatus = 'PENDING' | 'SETTLED' | 'DISPUTED';

export type RoomMemberBalance = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  balance: number;
  wins: number;
  losses: number;
  net_balance: number;
  settlement_status: SettlementStatus | null;
  left_at: string | null;
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

const ACTIVITY_PAGE_SIZE = 10;

export const roomActivityKey = (roomId: string) => ['rooms', roomId, 'activity'] as const;

/**
 * Paginated activity feed with infinite scroll support.
 * Fetches bets with pagination and chip requests (non-paginated, typically fewer).
 */
export function useRoomActivityFeedPaginated(roomId: string) {
  const { session } = useAuth();
  const { data: chipRequests, isLoading: chipRequestsLoading } = useRoomChipRequests(roomId);

  const betsQuery = useInfiniteQuery({
    queryKey: roomActivityKey(roomId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<BetWithProfiles[]> => {
      const { data, error } = await supabase
        .from('bets')
        .select(
          '*, offered_by_profile:profiles!bets_offered_by_fkey(*), subject_profile:profiles!bets_subject_user_id_fkey(*), outcome_submissions(*), stakes:bet_stakes(*, user:profiles!bet_stakes_user_id_fkey(*)), void_logs:bet_void_logs(*, voided_by_profile:profiles!bet_void_logs_voided_by_fkey(*))',
        )
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .range(pageParam, pageParam + ACTIVITY_PAGE_SIZE - 1);

      if (error) throw error;
      return data as unknown as BetWithProfiles[];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === ACTIVITY_PAGE_SIZE ? allPages.length * ACTIVITY_PAGE_SIZE : undefined,
    enabled: !!session?.user.id && !!roomId,
  });

  const items = useMemo((): ActivityItem[] => {
    const feed: ActivityItem[] = [];
    const bets = betsQuery.data?.pages.flat() ?? [];

    for (const bet of bets) {
      feed.push({ type: 'bet', timestamp: bet.created_at ?? '', bet });
    }

    // Chip requests are added once (not paginated) - they appear at the top if recent
    if (chipRequests) {
      for (const cr of chipRequests) {
        feed.push({ type: 'chip_request', timestamp: cr.created_at ?? '', chipRequest: cr });
      }
    }

    feed.sort((a, b) => (b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0));

    return feed;
  }, [betsQuery.data, chipRequests]);

  return {
    data: items,
    isLoading: betsQuery.isLoading || chipRequestsLoading,
    isFetchingNextPage: betsQuery.isFetchingNextPage,
    hasNextPage: betsQuery.hasNextPage,
    fetchNextPage: betsQuery.fetchNextPage,
  };
}

type RealtimeActivityFeedOptions = {
  /** Called when the current user is removed from the room */
  onCurrentUserRemoved?: () => void;
  /** Called when another member leaves or is removed from the room */
  onMemberLeft?: (userId: string, leftReason: 'VOLUNTARY' | 'REMOVED') => void;
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

export function useRealtimeActivityFeed(roomId: string, options?: RealtimeActivityFeedOptions) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const currentUserId = session?.user.id;

  // Store options in a ref to prevent re-subscriptions when callbacks change
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Create a stable debounced invalidator to batch rapid realtime events
  const invalidatorRef = useRef<ReturnType<typeof createDebouncedInvalidator> | null>(null);
  if (!invalidatorRef.current) {
    invalidatorRef.current = createDebouncedInvalidator(queryClient);
  }
  const invalidate = invalidatorRef.current;

  // Track active channels for cleanup and reconnection
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const isSubscribedRef = useRef(false);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Function to create and subscribe to all channels
  const setupSubscriptions = useCallback(() => {
    if (!roomId) return;

    // Clean up existing channels first
    const existingChannels = channelsRef.current;
    channelsRef.current = [];
    for (const ch of existingChannels) {
      void supabase.removeChannel(ch);
    }

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (__DEV__) console.log('[Realtime] Setting up subscriptions for room:', roomId);

    const token = realtimeTopicToken();
    const channels: RealtimeChannel[] = [];

    // Helper to handle subscription errors with retry
    const handleSubscriptionStatus = (channelName: string) => (status: string, err?: Error) => {
      if (__DEV__) console.log(`[Realtime] ${channelName} status:`, status, err?.message);

      if (status === 'SUBSCRIBED') {
        isSubscribedRef.current = true;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        isSubscribedRef.current = false;
        // Schedule reconnect if not already pending
        if (!reconnectTimeoutRef.current) {
          if (__DEV__) console.log('[Realtime] Scheduling reconnect due to', status);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            setupSubscriptions();
          }, 2000);
        }
      }
    };

    // bets channel
    const betsChannel = supabase
      .channel(`cc-feed:${roomId}:bets:${token}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bets', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (__DEV__) console.log('[Realtime] bets change:', payload.eventType, payload.new);
          void queryClient.refetchQueries({ queryKey: roomBetsKey(roomId) });
          void queryClient.refetchQueries({ queryKey: roomActivityKey(roomId) });
          invalidate(roomBalanceKey(roomId));
          invalidate(roomMemberBalancesKey(roomId));
          invalidate(ROOMS_ACTIVE_KEY);
          invalidate(ROOMS_HISTORY_KEY);
        },
      )
      .subscribe(handleSubscriptionStatus('bets'));
    channels.push(betsChannel);

    // chip_requests channel
    const chipRequestsChannel = supabase
      .channel(`cc-feed:${roomId}:chips:${token}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chip_requests', filter: `room_id=eq.${roomId}` },
        () => {
          invalidate(roomChipRequestsKey(roomId));
          invalidate(roomBalanceKey(roomId));
          invalidate(roomMemberBalancesKey(roomId));
          invalidate(ROOMS_ACTIVE_KEY);
          invalidate(ROOMS_HISTORY_KEY);
        },
      )
      .subscribe(handleSubscriptionStatus('chips'));
    channels.push(chipRequestsChannel);

    // outcome_submissions channel (no room_id filter - listens to all)
    const outcomeSubmissionsChannel = supabase
      .channel(`cc-feed:${roomId}:outcomes:${token}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'outcome_submissions' },
        (payload) => {
          if (__DEV__)
            console.log('[Realtime] outcome_submissions change:', payload.eventType, payload.new);
          void queryClient.refetchQueries({ queryKey: roomBetsKey(roomId) });
          void queryClient.refetchQueries({ queryKey: roomActivityKey(roomId) });
        },
      )
      .subscribe(handleSubscriptionStatus('outcomes'));
    channels.push(outcomeSubmissionsChannel);

    // bet_stakes channel (no room_id filter - listens to all)
    const betStakesChannel = supabase
      .channel(`cc-feed:${roomId}:stakes:${token}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bet_stakes' }, () => {
        void queryClient.refetchQueries({ queryKey: roomBetsKey(roomId) });
        void queryClient.refetchQueries({ queryKey: roomActivityKey(roomId) });
        invalidate(roomBalanceKey(roomId));
        invalidate(roomMemberBalancesKey(roomId));
        invalidate(ROOMS_ACTIVE_KEY);
        invalidate(ROOMS_HISTORY_KEY);
      })
      .subscribe(handleSubscriptionStatus('stakes'));
    channels.push(betStakesChannel);

    // room_members channel
    const roomMembersChannel = supabase
      .channel(`cc-feed:${roomId}:members:${token}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
        (payload) => {
          invalidate(roomMembersKey(roomId));
          invalidate(roomDetailKey(roomId));
          invalidate(roomMemberBalancesKey(roomId));
          invalidate(roomBalanceKey(roomId));
          invalidate(ROOMS_ACTIVE_KEY);
          invalidate(ROOMS_HISTORY_KEY);

          // Handle current user removal
          if (
            payload.eventType === 'DELETE' &&
            payload.old &&
            (payload.old as { user_id?: string }).user_id === currentUserId
          ) {
            optionsRef.current?.onCurrentUserRemoved?.();
          }

          // Handle member leave/removal
          if (payload.eventType === 'UPDATE') {
            const oldRecord = payload.old as { user_id?: string; left_at?: string | null };
            const newRecord = payload.new as {
              user_id?: string;
              left_at?: string | null;
              left_reason?: string;
            };
            if (
              oldRecord?.left_at == null &&
              newRecord?.left_at != null &&
              newRecord?.user_id &&
              newRecord.user_id !== currentUserId
            ) {
              const leftReason = newRecord.left_reason === 'REMOVED' ? 'REMOVED' : 'VOLUNTARY';
              optionsRef.current?.onMemberLeft?.(newRecord.user_id, leftReason);
            }
          }
        },
      )
      .subscribe(handleSubscriptionStatus('members'));
    channels.push(roomMembersChannel);

    // ledger_entries channel
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
          invalidate(ROOMS_ACTIVE_KEY);
          invalidate(ROOMS_HISTORY_KEY);
        },
      )
      .subscribe(handleSubscriptionStatus('ledger'));
    channels.push(ledgerEntriesChannel);

    // member_settlements channel
    const memberSettlementsChannel = supabase
      .channel(`cc-feed:${roomId}:settlements:${token}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'member_settlements',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          invalidate(roomMemberBalancesKey(roomId));
        },
      )
      .subscribe(handleSubscriptionStatus('settlements'));
    channels.push(memberSettlementsChannel);

    channelsRef.current = channels;
  }, [roomId, queryClient, currentUserId, invalidate]);

  // Main effect to setup subscriptions
  useEffect(() => {
    if (!roomId) return;

    // Drop any legacy channels
    const legacyTopic = `realtime:room-${roomId}-activity`;
    for (const ch of [...supabase.getChannels()]) {
      if (ch.topic === legacyTopic) {
        void supabase.removeChannel(ch);
      }
    }

    setupSubscriptions();

    return () => {
      // Clear reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      // Clean up all channels
      const channels = channelsRef.current;
      channelsRef.current = [];
      isSubscribedRef.current = false;
      for (const ch of channels) {
        void supabase.removeChannel(ch);
      }
    };
  }, [roomId, setupSubscriptions]);

  // Reconnect on app foreground
  useEffect(() => {
    if (!roomId) return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        if (__DEV__)
          console.log('[Realtime] App came to foreground, refreshing data and reconnecting');
        // Always refetch data when coming to foreground
        void queryClient.refetchQueries({ queryKey: roomActivityKey(roomId) });
        // Reconnect subscriptions
        setupSubscriptions();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [roomId, queryClient, setupSubscriptions]);

  // Reconnect on network change
  useEffect(() => {
    if (!roomId) return;

    let wasConnected = true;

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const isConnected = state.isConnected ?? false;

      if (__DEV__)
        console.log('[Realtime] Network state:', isConnected ? 'connected' : 'disconnected');

      // Reconnect when network comes back
      if (isConnected && !wasConnected) {
        if (__DEV__) console.log('[Realtime] Network restored, refreshing data and reconnecting');
        void queryClient.refetchQueries({ queryKey: roomActivityKey(roomId) });
        setupSubscriptions();
      }

      wasConnected = isConnected;
    });

    return () => unsubscribe();
  }, [roomId, queryClient, setupSubscriptions]);
}
