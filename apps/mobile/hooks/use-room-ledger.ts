import { useInfiniteQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

export type LedgerType =
  | 'BET_WIN'
  | 'BET_LOSS'
  | 'VOID_REFUND'
  | 'DONATION_IN'
  | 'DONATION_OUT'
  | 'GRANT';

export type LedgerEntryRow = {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  type: LedgerType;
  amount: number;
  bet_id: string | null;
  bet_question: string | null;
  chip_request_id: string | null;
  created_at: string;
};

export const LEDGER_PAGE_SIZE = 100;

export const roomLedgerKey = (roomId: string) => ['rooms', roomId, 'ledger'] as const;

export function useRoomLedger(roomId: string | null) {
  const { session } = useAuth();

  return useInfiniteQuery({
    queryKey: roomLedgerKey(roomId ?? ''),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<LedgerEntryRow[]> => {
      if (!roomId) return [];
      const { data, error } = await supabase.rpc('get_room_ledger', {
        p_room_id: roomId,
        p_limit: LEDGER_PAGE_SIZE,
        p_offset: pageParam,
      });
      if (error) throw error;
      // Supabase gen-types doesn't mark nullable columns from RETURNS TABLE;
      // cast through unknown so the hook's consumers get honest nullability.
      return (data as unknown as LedgerEntryRow[] | null) ?? [];
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === LEDGER_PAGE_SIZE ? allPages.length * LEDGER_PAGE_SIZE : undefined,
    enabled: !!session?.user.id && !!roomId,
  });
}
