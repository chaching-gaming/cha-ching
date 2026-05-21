import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Database } from '@cha-ching/types';

import { betDetailKey, roomActivityKey, roomBalanceKey, roomBetsKey } from '@/hooks/use-activity-feed';

type Bet = Database['public']['Tables']['bets']['Row'];

export function useResolveDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { p_bet_id: string; p_final_option: string; roomId: string }) => {
      const { data, error } = await supabase.rpc('resolve_dispute', {
        p_bet_id: params.p_bet_id,
        p_final_option: params.p_final_option,
      });
      if (error) throw error;
      return data as unknown as Bet;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roomBetsKey(variables.roomId) });
      queryClient.invalidateQueries({ queryKey: roomActivityKey(variables.roomId) });
      queryClient.invalidateQueries({ queryKey: betDetailKey(variables.p_bet_id) });
      queryClient.invalidateQueries({ queryKey: roomBalanceKey(variables.roomId) });
      // Winner's WIN ledger entry affects rooms-list balance too.
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}
