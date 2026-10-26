import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { betDetailKey, roomActivityKey, roomBetsKey } from './use-activity-feed';

/**
 * Hook to raise a dispute on a bet during the PENDING_DISPUTE window.
 * Only participants can raise disputes.
 */
export function useRaiseDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ p_bet_id }: { p_bet_id: string; roomId: string }) => {
      const { data, error } = await supabase.rpc('raise_dispute', { p_bet_id });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { roomId, p_bet_id }) => {
      queryClient.invalidateQueries({ queryKey: roomBetsKey(roomId) });
      queryClient.invalidateQueries({ queryKey: roomActivityKey(roomId) });
      queryClient.invalidateQueries({ queryKey: betDetailKey(p_bet_id) });
    },
  });
}
