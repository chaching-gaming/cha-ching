import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Database } from '@cha-ching/types';

import {
  roomBalanceKey,
  roomChipRequestsKey,
  roomMemberBalancesKey,
} from '@/hooks/use-activity-feed';
import { roomDetailKey } from '@/hooks/use-rooms';

type ChipRequest = Database['public']['Tables']['chip_requests']['Row'];
type Room = Database['public']['Tables']['rooms']['Row'];

export function useRequestChips() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      p_room_id: string;
      p_amount: number;
      p_message?: string | null;
    }) => {
      const message = params.p_message?.trim();
      const { data, error } = await supabase.rpc('request_chips', {
        p_room_id: params.p_room_id,
        p_amount: params.p_amount,
        ...(message ? { p_message: message } : {}),
      });
      if (error) throw error;
      return data as unknown as ChipRequest;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roomChipRequestsKey(variables.p_room_id) });
    },
  });
}

export function useDonateChips() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { p_chip_request_id: string; p_amount: number; roomId: string }) => {
      const { data, error } = await supabase.rpc('donate_chips', {
        p_chip_request_id: params.p_chip_request_id,
        p_amount: params.p_amount,
      });
      if (error) throw error;
      return data as unknown as ChipRequest;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roomChipRequestsKey(variables.roomId) });
      queryClient.invalidateQueries({ queryKey: roomBalanceKey(variables.roomId) });
      queryClient.invalidateQueries({ queryKey: roomMemberBalancesKey(variables.roomId) });
    },
  });
}

export function useCancelChipRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { p_chip_request_id: string; roomId: string }) => {
      const { data, error } = await supabase.rpc('cancel_chip_request', {
        p_chip_request_id: params.p_chip_request_id,
      });
      if (error) throw error;
      return data as unknown as ChipRequest;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roomChipRequestsKey(variables.roomId) });
    },
  });
}

export function useSetRoomChipLimit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { p_room_id: string; p_limit: number | null }) => {
      const { data, error } = await supabase.rpc('set_room_chip_limit', {
        p_room_id: params.p_room_id,
        p_limit: params.p_limit as number,
      });
      if (error) throw error;
      return data as unknown as Room;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roomDetailKey(variables.p_room_id) });
    },
  });
}
