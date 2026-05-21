import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Database } from '@cha-ching/types';

import { betDetailKey, roomActivityKey, roomBalanceKey, roomBetsKey } from '@/hooks/use-activity-feed';

type Bet = Database['public']['Tables']['bets']['Row'];

export function useVoidBet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { p_bet_id: string; p_reason?: string | null; roomId: string }) => {
      const trimmed = params.p_reason?.trim();
      const { data, error } = await supabase.rpc('void_bet', {
        p_bet_id: params.p_bet_id,
        ...(trimmed ? { p_reason: trimmed } : {}),
      });
      if (error) throw error;
      return data as unknown as Bet;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roomBetsKey(variables.roomId) });
      queryClient.invalidateQueries({ queryKey: roomActivityKey(variables.roomId) });
      queryClient.invalidateQueries({ queryKey: betDetailKey(variables.p_bet_id) });
      queryClient.invalidateQueries({ queryKey: roomBalanceKey(variables.roomId) });
      // Refund entries affect room balances in the rooms list too.
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}
