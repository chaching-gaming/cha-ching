import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { betDetailKey, roomActivityKey, roomBetsKey, roomBalanceKey } from './use-activity-feed';

/**
 * Hook to process the outcome window for a bet.
 * Called when outcome_window_ends_at expires to eliminate cron delay.
 */
export function useProcessOutcomeWindow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ p_bet_id }: { p_bet_id: string; roomId: string }) => {
      const { data, error } = await supabase.rpc('process_outcome_window', { p_bet_id });
      if (error) throw error;
      return data;
    },
    onSuccess: async (_, { roomId, p_bet_id }) => {
      // Use refetchQueries for immediate update (not invalidateQueries which waits for background refetch)
      await Promise.all([
        queryClient.refetchQueries({ queryKey: betDetailKey(p_bet_id) }),
        queryClient.refetchQueries({ queryKey: roomBetsKey(roomId) }),
        queryClient.refetchQueries({ queryKey: roomActivityKey(roomId) }),
      ]);
    },
  });
}

/**
 * Hook to process the dispute window for a bet.
 * Called when dispute_window_ends_at expires to eliminate cron delay.
 */
export function useProcessDisputeWindow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ p_bet_id }: { p_bet_id: string; roomId: string }) => {
      const { data, error } = await supabase.rpc('process_dispute_window', { p_bet_id });
      if (error) throw error;
      return data;
    },
    onSuccess: async (_, { roomId, p_bet_id }) => {
      // Use refetchQueries for immediate update to trigger celebration without delay
      await Promise.all([
        queryClient.refetchQueries({ queryKey: betDetailKey(p_bet_id) }),
        queryClient.refetchQueries({ queryKey: roomBetsKey(roomId) }),
        queryClient.refetchQueries({ queryKey: roomActivityKey(roomId) }),
        queryClient.refetchQueries({ queryKey: roomBalanceKey(roomId) }),
      ]);
    },
  });
}
