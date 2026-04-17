import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Database } from '@cha-ching/types';

import { roomBalanceKey, roomBetsKey } from '@/hooks/use-activity-feed';

type Bet = Database['public']['Tables']['bets']['Row'];

export function useAcceptBet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { p_bet_id: string; p_pick: string; roomId: string }) => {
      const { data, error } = await supabase.rpc('accept_bet', {
        p_bet_id: params.p_bet_id,
        p_pick: params.p_pick,
      });
      if (error) throw error;
      return data as unknown as Bet;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roomBetsKey(variables.roomId) });
      queryClient.invalidateQueries({ queryKey: roomBalanceKey(variables.roomId) });
      // Rooms list + room detail both read balances derived from ledger_entries, which changed.
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}
