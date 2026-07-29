import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

export type PlayerCategoryStat = {
  template_slug: string | null;
  template_label: string;
  bets: number;
  wins: number;
  losses: number;
};

export type PlayerStat = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  balance: number;
  wins: number;
  losses: number;
  category_breakdown: PlayerCategoryStat[];
};

export type PopularTemplate = {
  template_slug: string | null;
  label: string;
  bet_count: number;
};

export type RoomEventStats = {
  total_bets: number;
  open_bets: number;
  matched_bets: number;
  settled_bets: number;
  voided_bets: number;
  total_chips_wagered: number;
  total_donations: number;
  total_members: number;
  popular_templates: PopularTemplate[];
};

export const roomPlayerStatsKey = (roomId: string) => ['rooms', roomId, 'player-stats'] as const;
export const roomEventStatsKey = (roomId: string) => ['rooms', roomId, 'event-stats'] as const;
export const allRoomsPlayerStatsKey = () => ['all-rooms', 'player-stats'] as const;
export const allRoomsEventStatsKey = () => ['all-rooms', 'event-stats'] as const;

// Aggregate player stats across all rooms
export type AggregatePlayerStat = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  total_net_balance: number;
  total_wins: number;
  total_losses: number;
  rooms_count: number;
};

// Aggregate event stats across all rooms
export type AggregateEventStats = {
  total_rooms: number;
  total_bets: number;
  settled_bets: number;
  total_chips_wagered: number;
  total_donations: number;
};

export function useRoomPlayerStats(roomId: string | null) {
  const { session } = useAuth();

  return useQuery({
    queryKey: roomPlayerStatsKey(roomId ?? ''),
    queryFn: async (): Promise<PlayerStat[]> => {
      if (!roomId) return [];
      const { data, error } = await supabase.rpc('get_room_player_stats', { p_room_id: roomId });
      if (error) throw error;
      return ((data as unknown as PlayerStat[] | null) ?? []).map((row) => ({
        ...row,
        category_breakdown: Array.isArray(row.category_breakdown) ? row.category_breakdown : [],
      }));
    },
    enabled: !!session?.user.id && !!roomId,
  });
}

export function useRoomEventStats(roomId: string | null) {
  const { session } = useAuth();

  return useQuery({
    queryKey: roomEventStatsKey(roomId ?? ''),
    queryFn: async (): Promise<RoomEventStats | null> => {
      if (!roomId) return null;
      const { data, error } = await supabase.rpc('get_room_event_stats', { p_room_id: roomId });
      if (error) throw error;
      const row = Array.isArray(data) ? (data[0] as unknown as RoomEventStats | undefined) : null;
      if (!row) return null;
      return {
        ...row,
        popular_templates: Array.isArray(row.popular_templates) ? row.popular_templates : [],
      };
    },
    enabled: !!session?.user.id && !!roomId,
  });
}

// Aggregate stats across all rooms the user has been a member of
export function useAllRoomsPlayerStats() {
  const { session } = useAuth();

  return useQuery({
    queryKey: allRoomsPlayerStatsKey(),
    queryFn: async (): Promise<AggregatePlayerStat[]> => {
      // Type assertion needed until migration is applied and types are regenerated
      const { data, error } = await (supabase.rpc as Function)('get_all_rooms_player_stats');
      if (error) throw error;
      return (data as AggregatePlayerStat[] | null) ?? [];
    },
    enabled: !!session?.user.id,
  });
}

export function useAllRoomsEventStats() {
  const { session } = useAuth();

  return useQuery({
    queryKey: allRoomsEventStatsKey(),
    queryFn: async (): Promise<AggregateEventStats | null> => {
      // Type assertion needed until migration is applied and types are regenerated
      const { data, error } = await (supabase.rpc as Function)('get_all_rooms_event_stats');
      if (error) throw error;
      const row = Array.isArray(data) ? (data[0] as AggregateEventStats | undefined) : null;
      return row ?? null;
    },
    enabled: !!session?.user.id,
  });
}
