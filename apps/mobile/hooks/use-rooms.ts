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

export type RoomWithMembership = {
  role: RoomMember['role'];
  room: Room & { member_count: number };
  memberPreviews: MemberPreview[];
  balance: number;
};

export function useRooms(filter: 'active' | 'history' = 'active') {
  const { session } = useAuth();

  return useQuery({
    queryKey: roomsKey(filter),
    queryFn: async (): Promise<RoomWithMembership[]> => {
      const userId = session!.user.id;

      const { data: memberships, error: memErr } = await supabase
        .from('room_members')
        .select('role, room_id')
        .eq('user_id', userId)
        .order('joined_at', { ascending: false });

      if (memErr) throw memErr;
      if (!memberships?.length) return [];

      const roomIds = memberships.map((m) => m.room_id).filter(Boolean) as string[];

      // Fetch rooms, member previews, and balances in parallel
      const [roomsResult, membersResult, balancesResult] = await Promise.all([
        supabase
          .from('rooms')
          .select('*, room_members(count)')
          .in('id', roomIds)
          .eq('is_active', filter === 'active'),
        supabase
          .from('room_members')
          .select('room_id, profiles(display_name, avatar_url)')
          .in('room_id', roomIds)
          .order('joined_at', { ascending: true }),
        supabase
          .from('ledger_entries')
          .select('room_id, amount')
          .in('room_id', roomIds)
          .eq('user_id', userId),
      ]);

      if (roomsResult.error) throw roomsResult.error;

      const roomMap = new Map(
        (roomsResult.data ?? []).map((r) => {
          const count =
            Array.isArray(r.room_members) && r.room_members.length > 0
              ? (r.room_members[0] as { count: number }).count
              : 0;
          return [r.id, { ...r, member_count: count }];
        }),
      );

      // Group member previews by room (first 3 per room)
      const previewMap = new Map<string, MemberPreview[]>();
      for (const row of membersResult.data ?? []) {
        if (!row.room_id) continue;
        const list = previewMap.get(row.room_id) ?? [];
        if (list.length < 3) {
          const p = row.profiles as unknown as MemberPreview | null;
          if (p) list.push(p);
        }
        previewMap.set(row.room_id, list);
      }

      // Sum balances by room
      const balanceMap = new Map<string, number>();
      for (const row of balancesResult.data ?? []) {
        if (!row.room_id) continue;
        balanceMap.set(row.room_id, (balanceMap.get(row.room_id) ?? 0) + Number(row.amount));
      }

      return memberships
        .filter((m) => m.room_id && roomMap.has(m.room_id))
        .map((m) => ({
          role: m.role,
          room: roomMap.get(m.room_id!)!,
          memberPreviews: previewMap.get(m.room_id!) ?? [],
          balance: balanceMap.get(m.room_id!) ?? 0,
        }));
    },
    enabled: !!session?.user.id,
  });
}

/**
 * Realtime subscription for rooms list - listens to ledger_entries changes
 * for the current user to update balances across all rooms in realtime.
 */
export function useRealtimeRoomsList() {
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

    // Subscribe to room_members changes for the current user (to detect being removed)
    const membersChannel = supabase
      .channel(`cc-rooms-list:members:${token}`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'room_members',
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          // When removed from a room, refresh the rooms list
          invalidate(roomsKey('active'));
          invalidate(roomsKey('history'));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ledgerChannel);
      void supabase.removeChannel(chipRequestsChannel);
      void supabase.removeChannel(membersChannel);
    };
  }, [currentUserId, queryClient]);
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
        .order('joined_at');

      if (error) throw error;
      return data as unknown as RoomMemberWithProfile[];
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
    }) => {
      const { data, error } = await supabase.rpc('create_room', {
        p_name: params.p_name,
        p_session_date: params.p_session_date,
        p_starting_chips: params.p_starting_chips ?? 1000,
      });
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
