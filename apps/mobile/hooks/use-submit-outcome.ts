import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Database } from '@cha-ching/types';

import { betDetailKey, roomActivityKey, roomBalanceKey, roomBetsKey } from '@/hooks/use-activity-feed';

type OutcomeSubmission = Database['public']['Tables']['outcome_submissions']['Row'];

export function useSubmitOutcome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { p_bet_id: string; p_selected_option: string; roomId: string }) => {
      const { data, error } = await supabase.rpc('submit_outcome', {
        p_bet_id: params.p_bet_id,
        p_selected_option: params.p_selected_option,
      });
      if (error) throw error;
      return data as unknown as OutcomeSubmission;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roomBetsKey(variables.roomId) });
      queryClient.invalidateQueries({ queryKey: roomActivityKey(variables.roomId) });
      // Invalidate the individual bet detail query so the UI updates immediately
      queryClient.invalidateQueries({ queryKey: betDetailKey(variables.p_bet_id) });
      // Consensus auto-settle at the tail of submit_outcome may credit a WIN
      // ledger entry, so the balance (and rooms-list balance) can change too.
      queryClient.invalidateQueries({ queryKey: roomBalanceKey(variables.roomId) });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}
