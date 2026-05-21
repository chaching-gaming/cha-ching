import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Database } from '@cha-ching/types';

import { betDetailKey, roomActivityKey, roomBalanceKey, roomBetsKey } from '@/hooks/use-activity-feed';
import { useFeedback } from '@/providers/feedback';

type Bet = Database['public']['Tables']['bets']['Row'];

export function useJoinBet() {
  const queryClient = useQueryClient();
  const { trigger } = useFeedback();

  return useMutation({
    mutationFn: async (params: { p_bet_id: string; p_pick: string; roomId: string }) => {
      const { data, error } = await supabase.rpc('join_bet', {
        p_bet_id: params.p_bet_id,
        p_pick: params.p_pick,
      });
      if (error) throw error;
      return data as unknown as Bet;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roomBetsKey(variables.roomId) });
      queryClient.invalidateQueries({ queryKey: roomActivityKey(variables.roomId) });
      queryClient.invalidateQueries({ queryKey: betDetailKey(variables.p_bet_id) });
      queryClient.invalidateQueries({ queryKey: roomBalanceKey(variables.roomId) });
      // Rooms list balance derives from ledger_entries, which changed.
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      trigger('bet_accepted');
    },
  });
}
