import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Database } from '@cha-ching/types';

import { roomBalanceKey, roomBetsKey } from '@/hooks/use-activity-feed';

type Bet = Database['public']['Tables']['bets']['Row'];

export function useCreateBet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      p_room_id: string;
      p_question: string;
      p_options: string[];
      p_stake: number;
      p_expires_at: string;
      p_offered_pick: string;
      p_subject_user_id?: string | null;
      p_subject_positive_option?: string | null;
      p_template_id?: string | null;
      p_subject_display_name?: string | null;
    }) => {
      const args: {
        p_room_id: string;
        p_question: string;
        p_options: string[];
        p_stake: number;
        p_expires_at: string;
        p_offered_pick: string;
        p_subject_user_id?: string;
        p_subject_positive_option?: string;
        p_template_id?: string;
        p_subject_display_name?: string;
      } = {
        p_room_id: params.p_room_id,
        p_question: params.p_question,
        p_options: params.p_options,
        p_stake: params.p_stake,
        p_expires_at: params.p_expires_at,
        p_offered_pick: params.p_offered_pick,
      };
      if (params.p_subject_user_id) {
        args.p_subject_user_id = params.p_subject_user_id;
      }
      if (params.p_subject_positive_option) {
        args.p_subject_positive_option = params.p_subject_positive_option;
      }
      if (params.p_template_id) {
        args.p_template_id = params.p_template_id;
        args.p_subject_display_name = params.p_subject_display_name?.trim() ?? '';
      }

      // Type assertion needed until DB types are regenerated after migration
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc('create_bet', args as any);
      if (error) throw error;
      return data as unknown as Bet;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roomBetsKey(variables.p_room_id) });
      // Creator now immediately has a BET ledger entry locking their stake.
      queryClient.invalidateQueries({ queryKey: roomBalanceKey(variables.p_room_id) });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}
