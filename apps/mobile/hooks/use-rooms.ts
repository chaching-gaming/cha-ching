import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Database } from '@cha-ching/types';
import { useAuth } from '@/providers/auth';

type Room = Database['public']['Tables']['rooms']['Row'];
type RoomMember = Database['public']['Tables']['room_members']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

const ROOMS_KEY = ['rooms'] as const;
const roomDetailKey = (id: string) => ['rooms', id] as const;
const roomMembersKey = (id: string) => ['rooms', id, 'members'] as const;

export type RoomWithMembership = {
  role: RoomMember['role'];
  room: Room & { member_count: number };
};

export function useRooms() {
  const { session } = useAuth();

  return useQuery({
    queryKey: ROOMS_KEY,
    queryFn: async (): Promise<RoomWithMembership[]> => {
      const { data: memberships, error: memErr } = await supabase
        .from('room_members')
        .select('role, room_id')
        .eq('user_id', session!.user.id)
        .order('joined_at', { ascending: false });

      if (memErr) throw memErr;
      if (!memberships?.length) return [];

      const roomIds = memberships.map((m) => m.room_id).filter(Boolean) as string[];

      const { data: rooms, error: roomErr } = await supabase
        .from('rooms')
        .select('*, room_members(count)')
        .in('id', roomIds);

      if (roomErr) throw roomErr;

      const roomMap = new Map(
        (rooms ?? []).map((r) => {
          const count =
            Array.isArray(r.room_members) && r.room_members.length > 0
              ? (r.room_members[0] as { count: number }).count
              : 0;
          return [r.id, { ...r, member_count: count }];
        }),
      );

      return memberships
        .filter((m) => m.room_id && roomMap.has(m.room_id))
        .map((m) => ({
          role: m.role,
          room: roomMap.get(m.room_id!)!,
        }));
    },
    enabled: !!session?.user.id,
  });
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
      p_description?: string | null;
      p_chip_limit?: number | null;
    }) => {
      const { data, error } = await supabase.rpc('create_room', params);
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

export function parseJoinError(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;
    switch (code) {
      case 'P0001':
        return 'No room found with that code';
      case 'P0002':
        return 'This room is no longer active';
      case 'P0003':
        return "You're already a member of this room";
    }
  }
  return 'Failed to join room';
}
