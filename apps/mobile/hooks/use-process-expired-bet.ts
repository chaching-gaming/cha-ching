import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Database } from '@cha-ching/types';

import { betDetailKey, roomActivityKey, roomBalanceKey, roomBetsKey } from '@/hooks/use-activity-feed';

type Bet = Database['public']['Tables']['bets']['Row'];

/**
 * Immediately processes an expired bet, triggering VOID+REFUND or PENDING_RESULT
 * transition without waiting for the cron job (eliminates 0-60s lag).
 */
export function useProcessExpiredBet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { betId: string; roomId: string }) => {
      // Type assertion needed until `pnpm db:gen-types` is run after migration
      const { data, error } = await (supabase.rpc as Function)('process_expired_bet', {
        p_bet_id: params.betId,
      });
      if (error) throw error;
      return data as Bet;
    },
    onSuccess: async (_data, variables) => {
      // Force immediate refetch for critical queries (balance, bet detail)
      // Using refetchQueries ensures data updates immediately, not just marked stale
      await Promise.all([
        queryClient.refetchQueries({ queryKey: betDetailKey(variables.betId) }),
        queryClient.refetchQueries({ queryKey: roomBalanceKey(variables.roomId) }),
      ]);

      // Invalidate other queries (they'll refetch when observed)
      queryClient.invalidateQueries({ queryKey: roomBetsKey(variables.roomId) });
      queryClient.invalidateQueries({ queryKey: roomActivityKey(variables.roomId) });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}
