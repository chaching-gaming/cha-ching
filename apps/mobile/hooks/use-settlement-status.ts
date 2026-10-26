import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { roomMemberBalancesKey } from './use-activity-feed';
import type { SettlementStatus } from './use-activity-feed';

type UpdateSettlementStatusParams = {
  roomId: string;
  userId: string;
  status: SettlementStatus;
};

export function useUpdateSettlementStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roomId, userId, status }: UpdateSettlementStatusParams) => {
      const { data, error } = await supabase.rpc('update_settlement_status', {
        p_room_id: roomId,
        p_user_id: userId,
        p_status: status,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { roomId }) => {
      // Invalidate member balances to refresh the settlement status
      queryClient.invalidateQueries({ queryKey: roomMemberBalancesKey(roomId) });
    },
  });
}
