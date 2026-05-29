import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { betDetailKey, roomBetsKey } from './use-activity-feed';

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
    onSuccess: (_, { roomId, p_bet_id }) => {
      queryClient.invalidateQueries({ queryKey: roomBetsKey(roomId) });
      queryClient.invalidateQueries({ queryKey: betDetailKey(p_bet_id) });
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
    onSuccess: (_, { roomId, p_bet_id }) => {
      queryClient.invalidateQueries({ queryKey: roomBetsKey(roomId) });
      queryClient.invalidateQueries({ queryKey: betDetailKey(p_bet_id) });
    },
  });
}
