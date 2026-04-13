import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Database } from '@cha-ching/types';

import { roomBetsKey } from '@/hooks/use-activity-feed';

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
      p_template_id?: string | null;
      p_subject_display_name?: string | null;
    }) => {
      const args: {
        p_room_id: string;
        p_question: string;
        p_options: string[];
        p_stake: number;
        p_expires_at: string;
        p_template_id?: string;
        p_subject_display_name?: string;
      } = {
        p_room_id: params.p_room_id,
        p_question: params.p_question,
        p_options: params.p_options,
        p_stake: params.p_stake,
        p_expires_at: params.p_expires_at,
      };
      if (params.p_template_id) {
        args.p_template_id = params.p_template_id;
        args.p_subject_display_name = params.p_subject_display_name?.trim() ?? '';
      }

      const { data, error } = await supabase.rpc('create_bet', args);
      if (error) throw error;
      return data as unknown as Bet;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roomBetsKey(variables.p_room_id) });
    },
  });
}
