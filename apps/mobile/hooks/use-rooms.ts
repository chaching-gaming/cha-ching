import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Database } from '@cha-ching/types';
import { useAuth } from '@/providers/auth';

type Room = Database['public']['Tables']['rooms']['Row'];
type RoomMember = Database['public']['Tables']['room_members']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

const ROOMS_KEY = ['rooms'] as const;
const roomsKey = (filter: 'active' | 'history') => ['rooms', filter] as const;

/** Generate unique topic token for realtime subscriptions */
function realtimeTopicToken(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Creates a debounced invalidation function that batches rapid query invalidations.
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
export const roomDetailKey = (id: string) => ['rooms', id] as const;
export const roomMembersKey = (id: string) => ['rooms', id, 'members'] as const;

export type MemberPreview = {
  display_name: string | null;
  avatar_url: string | null;
};

export type MembershipStatus = 'active' | 'left' | 'removed' | 'room_closed';

export type RoomWithMembership = {
  role: RoomMember['role'];
  room: Room & { member_count: number };
  memberPreviews: MemberPreview[];
  balance: number;
  // For past rooms tracking
  membershipStatus: MembershipStatus;
  leftAt: string | null;
  leftReason: string | null;
};

function getMembershipStatus(
  leftAt: string | null,
  leftReason: string | null,
  roomIsActive: boolean
): MembershipStatus {
  if (!leftAt) {
    // Still a member but room is closed
    return roomIsActive ? 'active' : 'room_closed';
  }
  switch (leftReason) {
    case 'VOLUNTARY':
      return 'left';
    case 'REMOVED':
      return 'removed';
    case 'ROOM_CLOSED':
      return 'room_closed';
    default:
      return 'left';
  }
}

export function useRooms(filter: 'active' | 'history' = 'active') {
  const { session } = useAuth();

  return useQuery({
    queryKey: roomsKey(filter),
    queryFn: async (): Promise<RoomWithMembership[]> => {
      const userId = session!.user.id;

      // Fetch memberships WITH left_at and left_reason for soft-delete tracking
      const { data: memberships, error: memErr } = await supabase
        .from('room_members')
        .select('role, room_id, left_at, left_reason')
        .eq('user_id', userId)
        .order('joined_at', { ascending: false });

      if (memErr) throw memErr;
      if (!memberships?.length) return [];

      // Filter memberships based on active vs history
      // Active: left_at IS NULL (still a member)
      // History: left_at IS NOT NULL (left/removed) - room status doesn't matter
      const relevantMemberships = memberships.filter((m) => {
        if (filter === 'active') {
          return m.left_at === null;
        } else {
          // History: user has left/been removed
          return m.left_at !== null;
        }
      });

      if (!relevantMemberships.length) return [];

      const roomIds = relevantMemberships.map((m) => m.room_id).filter(Boolean) as string[];

      // Fetch rooms, member previews, and balances in parallel
      // For active filter, only show active rooms
      // For history filter, show any room (could be active or closed)
      const roomsQuery = supabase.from('rooms').select('*, room_members!inner(count)').in('id', roomIds);

      if (filter === 'active') {
        roomsQuery.eq('is_active', true);
      }

      const [roomsResult, membersResult, balancesResult] = await Promise.all([
        roomsQuery,
        // Only count ACTIVE members (left_at IS NULL)
        supabase
          .from('room_members')
          .select('room_id, left_at, profiles(display_name, avatar_url)')
          .in('room_id', roomIds)
          .is('left_at', null)
          .order('joined_at', { ascending: true }),
        supabase
          .from('ledger_entries')
          .select('room_id, amount')
          .in('room_id', roomIds)
          .eq('user_id', userId),
      ]);

      if (roomsResult.error) throw roomsResult.error;

      // Group member previews by room (first 3 per room, only active members)
      // Also count active members per room for accurate overflow display
      const previewMap = new Map<string, MemberPreview[]>();
      const activeMemberCountMap = new Map<string, number>();
      for (const row of membersResult.data ?? []) {
        if (!row.room_id) continue;
        // Count active members
        activeMemberCountMap.set(row.room_id, (activeMemberCountMap.get(row.room_id) ?? 0) + 1);
        // Build preview list (max 3)
        const list = previewMap.get(row.room_id) ?? [];
        if (list.length < 3) {
          const p = row.profiles as unknown as MemberPreview | null;
          if (p) list.push(p);
        }
        previewMap.set(row.room_id, list);
      }

      const roomMap = new Map(
        (roomsResult.data ?? []).map((r) => {
          // Use active member count instead of total count
          const count = activeMemberCountMap.get(r.id) ?? 0;
          return [r.id, { ...r, member_count: count }];
        }),
      );

      // Sum balances by room
      const balanceMap = new Map<string, number>();
      for (const row of balancesResult.data ?? []) {
        if (!row.room_id) continue;
        balanceMap.set(row.room_id, (balanceMap.get(row.room_id) ?? 0) + Number(row.amount));
      }

      return relevantMemberships
        .filter((m) => m.room_id && roomMap.has(m.room_id))
        .map((m) => {
          const room = roomMap.get(m.room_id!)!;
          return {
            role: m.role,
            room,
            memberPreviews: previewMap.get(m.room_id!) ?? [],
            balance: balanceMap.get(m.room_id!) ?? 0,
            membershipStatus: getMembershipStatus(m.left_at, m.left_reason, room.is_active),
            leftAt: m.left_at,
            leftReason: m.left_reason,
          };
        });
    },
    enabled: !!session?.user.id,
  });
}

/**
 * Realtime subscription for rooms list - listens to ledger_entries changes
 * for the current user to update balances across all rooms in realtime,
 * and room_members changes to detect when other users join/leave/rejoin.
 */
export function useRealtimeRoomsList() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const currentUserId = session?.user.id;
  const { data: rooms } = useRooms('active');

  // Create a stable debounced invalidator to batch rapid realtime events
  const invalidatorRef = useRef<ReturnType<typeof createDebouncedInvalidator> | null>(null);
  if (!invalidatorRef.current) {
    invalidatorRef.current = createDebouncedInvalidator(queryClient);
  }
  const invalidate = invalidatorRef.current;

  // Get stable room IDs string for dependency comparison
  const roomIds = rooms?.map((r) => r.room.id) ?? [];
  const roomIdsKey = roomIds.join(',');

  useEffect(() => {
    if (!currentUserId) return;

    const token = realtimeTopicToken();

    // Subscribe to ledger_entries for the current user (balance changes)
    const ledgerChannel = supabase
      .channel(`cc-rooms-list:ledger:${token}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ledger_entries',
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          // Invalidate both active and history room lists to refresh balances
          invalidate(roomsKey('active'));
          invalidate(roomsKey('history'));
        },
      )
      .subscribe();

    // Also subscribe to chip_requests for the current user (to see request status updates)
    const chipRequestsChannel = supabase
      .channel(`cc-rooms-list:chips:${token}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chip_requests',
          filter: `requested_by=eq.${currentUserId}`,
        },
        () => {
          invalidate(roomsKey('active'));
          invalidate(roomsKey('history'));
        },
      )
      .subscribe();

    // Subscribe to room_members changes for the current user (to detect own soft-delete/rejoin)
    const ownMemberChannel = supabase
      .channel(`cc-rooms-list:own-member:${token}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'room_members',
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          // When left_at changes (soft-delete or rejoin), refresh the rooms list
          invalidate(roomsKey('active'));
          invalidate(roomsKey('history'));
        },
      )
      .subscribe();

    // Subscribe to room_members changes for ALL rooms the user is in
    // This catches when OTHER users join/leave/rejoin, updating member count and avatars
    const roomMemberChannels = roomIds.map((roomId) =>
      supabase
        .channel(`cc-rooms-list:room-members:${roomId}:${token}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'room_members',
            filter: `room_id=eq.${roomId}`,
          },
          () => {
            invalidate(roomsKey('active'));
            invalidate(roomsKey('history'));
          },
        )
        .subscribe()
    );

    return () => {
      void supabase.removeChannel(ledgerChannel);
      void supabase.removeChannel(chipRequestsChannel);
      void supabase.removeChannel(ownMemberChannel);
      roomMemberChannels.forEach((ch) => void supabase.removeChannel(ch));
    };
  }, [currentUserId, queryClient, roomIdsKey]);
}

/**
 * Realtime subscription for history rooms to detect room status changes.
 * This ensures the Rejoin button hides when a room session ends after a user has left.
 */
export function useRealtimeHistoryRooms() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const currentUserId = session?.user.id;
  const { data: historyRooms } = useRooms('history');

  const invalidatorRef = useRef<ReturnType<typeof createDebouncedInvalidator> | null>(null);
  if (!invalidatorRef.current) {
    invalidatorRef.current = createDebouncedInvalidator(queryClient);
  }
  const invalidate = invalidatorRef.current;

  // Get room IDs from history rooms (only active ones where rejoin is possible)
  const activeHistoryRoomIds =
    historyRooms?.filter((r) => r.room.is_active).map((r) => r.room.id) ?? [];
  const roomIdsKey = activeHistoryRoomIds.join(',');

  useEffect(() => {
    if (!currentUserId || activeHistoryRoomIds.length === 0) return;

    const token = realtimeTopicToken();

    // Subscribe to rooms table changes for active history rooms
    const roomChannels = activeHistoryRoomIds.map((roomId) =>
      supabase
        .channel(`cc-history-rooms:${roomId}:${token}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rooms',
            filter: `id=eq.${roomId}`,
          },
          () => {
            invalidate(roomsKey('history'));
          }
        )
        .subscribe()
    );

    return () => {
      roomChannels.forEach((ch) => void supabase.removeChannel(ch));
    };
  }, [currentUserId, roomIdsKey]);
}

export function useRoomDetail(roomId: string) {
  const { session } = useAuth();

  return useQuery({
    queryKey: roomDetailKey(roomId),
    queryFn: async (): Promise<Room> => {
      const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).single();

      if (error) throw error;
      return data;
    },
    enabled: !!session?.user.id && !!roomId,
  });
}

export type RoomMemberWithProfile = RoomMember & {
  profiles: Profile;
};

export function useRoomMembers(roomId: string) {
  const { session } = useAuth();

  return useQuery({
    queryKey: roomMembersKey(roomId),
    queryFn: async (): Promise<RoomMemberWithProfile[]> => {
      const { data, error } = await supabase
        .from('room_members')
        .select('*, profiles(*)')
        .eq('room_id', roomId)
        .is('left_at', null) // Only active members
        .order('joined_at');

      if (error) throw error;
      return data as unknown as RoomMemberWithProfile[];
    },
    enabled: !!session?.user.id && !!roomId,
  });
}

export type RoomMemberStatus = 'active' | 'left' | 'removed';

export type RoomMemberWithStatus = RoomMemberWithProfile & {
  membershipStatus: RoomMemberStatus;
};

/** Helper to create a lookup map of user_id -> membership status from room members */
export function createMembershipStatusMap(
  members: RoomMemberWithStatus[] | undefined
): Map<string, RoomMemberStatus> {
  const map = new Map<string, RoomMemberStatus>();
  if (!members) return map;
  for (const member of members) {
    if (member.user_id) {
      map.set(member.user_id, member.membershipStatus);
    }
  }
  return map;
}

/** Check if a member is inactive (left or removed) */
export function isMemberInactive(status: RoomMemberStatus | undefined): boolean {
  return status === 'left' || status === 'removed';
}

/** Get display label for membership status */
export function getMembershipStatusLabel(status: RoomMemberStatus | undefined): string | null {
  switch (status) {
    case 'left':
      return 'Left';
    case 'removed':
      return 'Removed';
    default:
      return null;
  }
}

export function useRoomMembersWithHistory(roomId: string) {
  const { session } = useAuth();

  return useQuery({
    queryKey: [...roomMembersKey(roomId), 'history'],
    queryFn: async (): Promise<RoomMemberWithStatus[]> => {
      const { data, error } = await supabase
        .from('room_members')
        .select('*, profiles(*)')
        .eq('room_id', roomId)
        .order('left_at', { ascending: true, nullsFirst: true })
        .order('joined_at');

      if (error) throw error;

      return (data as unknown as RoomMemberWithProfile[]).map((m) => ({
        ...m,
        membershipStatus: !m.left_at
          ? 'active'
          : m.left_reason === 'REMOVED'
            ? 'removed'
            : 'left',
      }));
    },
    enabled: !!session?.user.id && !!roomId,
  });
}

export function useCreateRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      p_name: string;
      p_session_date: string;
      p_starting_chips?: number;
      p_outcome_submission_window_seconds?: number;
    }) => {
      const { data, error } = await supabase.rpc('create_room', {
        p_name: params.p_name,
        p_session_date: params.p_session_date,
        p_starting_chips: params.p_starting_chips ?? 1000,
        p_outcome_submission_window_seconds: params.p_outcome_submission_window_seconds ?? 30,
      } as Parameters<typeof supabase.rpc<'create_room'>>[1]);
      if (error) throw error;
      return data as unknown as Room;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROOMS_KEY });
    },
  });
}

export function useJoinRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { p_invite_code: string }) => {
      const { data, error } = await supabase.rpc('join_room_via_invite', params);
      if (error) throw error;
      return data as unknown as Room;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROOMS_KEY });
    },
  });
}

export function useEndSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { p_room_id: string }) => {
      const { data, error } = await supabase.rpc('end_session', params);
      if (error) throw error;
      return data as unknown as Room;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ROOMS_KEY });
      queryClient.invalidateQueries({ queryKey: roomDetailKey(variables.p_room_id) });
    },
  });
}

export function useReassignAdmin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { p_room_id: string; p_new_admin_user_id: string }) => {
      const { data, error } = await supabase.rpc('reassign_admin', params);
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roomMembersKey(variables.p_room_id) });
    },
  });
}

/** Uses the server/PostgREST error message; no duplicated code→string maps. */
export function getRpcErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message?: string }).message;
    if (typeof m === 'string' && m.trim().length > 0) return m;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      p_room_id: string;
      p_target_user_id: string;
      p_new_role: 'PLAYER' | 'ATTESTOR' | 'ADMIN';
    }) => {
      const { error } = await supabase.rpc('update_member_role', params);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roomMembersKey(variables.p_room_id) });
      queryClient.invalidateQueries({ queryKey: roomDetailKey(variables.p_room_id) });
      queryClient.invalidateQueries({ queryKey: ROOMS_KEY });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { p_room_id: string; p_target_user_id: string }) => {
      const { error } = await supabase.rpc('remove_member', params);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roomMembersKey(variables.p_room_id) });
      queryClient.invalidateQueries({ queryKey: roomDetailKey(variables.p_room_id) });
      queryClient.invalidateQueries({ queryKey: ROOMS_KEY });
    },
  });
}

export function useLeaveRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { p_room_id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)('leave_room', params);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROOMS_KEY });
    },
  });
}

export function useUpdateRoomSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      p_room_id: string;
      p_outcome_submission_window_seconds?: number;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('update_room_settings', params);
      if (error) throw error;
      return data as unknown as Room;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roomDetailKey(variables.p_room_id) });
      queryClient.invalidateQueries({ queryKey: ROOMS_KEY });
    },
  });
}
