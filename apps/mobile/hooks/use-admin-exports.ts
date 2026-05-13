import { useMutation } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { toCsv, type CsvColumn } from '@cha-ching/utils';
import { supabase } from '@/lib/supabase';
import type { LedgerEntryRow, LedgerType } from '@/hooks/use-room-ledger';

type BetExportRow = {
  id: string;
  created_at: string | null;
  settled_at: string | null;
  status: string | null;
  question: string;
  options: unknown;
  stake: number;
  offered_by: string | null;
  offered_by_name: string | null;
  offered_pick: string | null;
  accepted_by: string | null;
  accepted_by_name: string | null;
  accepted_pick: string | null;
  subject_user_id: string | null;
  subject_user_name: string | null;
  subject_positive_option: string | null;
  outcome: string | null;
  winner: string | null;
  winner_name: string | null;
  settlement_method: string | null;
  voided_at: string | null;
  voided_by: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
};

const EXPORT_ROW_LIMIT = 10000;

const LEDGER_TYPE_LABELS: Record<LedgerType, string> = {
  BET_WIN: 'Bet win',
  BET_LOSS: 'Bet loss',
  STAKE_LOCK: 'Stake locked',
  VOID_REFUND: 'Void refund',
  DONATION_IN: 'Donation received',
  DONATION_OUT: 'Donation sent',
  GRANT: 'Starting grant',
};

// `ledger-weekend-poker-20260420.csv` — safe across iOS / Android / share sheet UIs.
function buildFileName(dataset: 'ledger' | 'bets', roomName: string | null | undefined): string {
  const slug = (roomName ?? 'room')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 32);
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${dataset}-${slug || 'room'}-${stamp}.csv`;
}

async function shareCsv(csv: string, fileName: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  const file = new File(Paths.cache, fileName);
  // Overwrite any leftover file from a prior export with the same name.
  if (file.exists) file.delete();
  file.create();
  file.write(csv);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: fileName,
  });
}

const LEDGER_COLUMNS: CsvColumn<LedgerEntryRow>[] = [
  { key: 'created_at', header: 'Timestamp', format: (v) => (v ? new Date(v as string).toISOString() : '') },
  { key: 'user_id', header: 'User ID' },
  { key: 'display_name', header: 'Display Name' },
  { key: 'type', header: 'Type', format: (v) => LEDGER_TYPE_LABELS[v as LedgerType] ?? String(v) },
  { key: 'amount', header: 'Amount' },
  { key: 'bet_id', header: 'Bet ID' },
  { key: 'bet_question', header: 'Bet Question' },
  { key: 'chip_request_id', header: 'Chip Request ID' },
  { key: 'id', header: 'Entry ID' },
];

const BET_COLUMNS: CsvColumn<BetExportRow>[] = [
  { key: 'id', header: 'Bet ID' },
  { key: 'created_at', header: 'Created', format: (v) => (v ? new Date(v as string).toISOString() : '') },
  { key: 'settled_at', header: 'Settled', format: (v) => (v ? new Date(v as string).toISOString() : '') },
  { key: 'status', header: 'Status' },
  { key: 'question', header: 'Question' },
  { key: 'stake', header: 'Stake' },
  { key: 'offered_by_name', header: 'Offered By' },
  { key: 'offered_pick', header: 'Offered Pick' },
  { key: 'accepted_by_name', header: 'Accepted By' },
  { key: 'accepted_pick', header: 'Accepted Pick' },
  { key: 'subject_user_name', header: 'Subject' },
  { key: 'subject_positive_option', header: 'Subject Positive Option' },
  { key: 'outcome', header: 'Outcome' },
  { key: 'winner_name', header: 'Winner' },
  { key: 'settlement_method', header: 'Settlement Method' },
  { key: 'voided_at', header: 'Voided At', format: (v) => (v ? new Date(v as string).toISOString() : '') },
  { key: 'voided_by_name', header: 'Voided By' },
  { key: 'void_reason', header: 'Void Reason' },
  {
    key: 'options',
    header: 'Options',
    // Serialize the jsonb options array as JSON so structure survives the round-trip.
    format: (v) => {
      if (v === null || v === undefined) return '';
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    },
  },
];

export function useExportRoomLedger(roomId: string | null, roomName: string | null | undefined) {
  return useMutation({
    mutationFn: async () => {
      if (!roomId) throw new Error('Room not loaded.');
      const { data, error } = await supabase.rpc('get_room_ledger', {
        p_room_id: roomId,
        p_limit: EXPORT_ROW_LIMIT,
        p_offset: 0,
      });
      if (error) throw error;
      const rows = (data as unknown as LedgerEntryRow[] | null) ?? [];
      if (rows.length === 0) {
        throw new Error('No ledger entries to export.');
      }
      const csv = toCsv(rows, LEDGER_COLUMNS);
      await shareCsv(csv, buildFileName('ledger', roomName));
      return rows.length;
    },
  });
}

export function useExportRoomBets(roomId: string | null, roomName: string | null | undefined) {
  return useMutation({
    mutationFn: async () => {
      if (!roomId) throw new Error('Room not loaded.');
      const { data, error } = await supabase.rpc('export_room_bets', {
        p_room_id: roomId,
      });
      if (error) throw error;
      const rows = (data as unknown as BetExportRow[] | null) ?? [];
      if (rows.length === 0) {
        throw new Error('No bets to export.');
      }
      const csv = toCsv(rows, BET_COLUMNS);
      await shareCsv(csv, buildFileName('bets', roomName));
      return rows.length;
    },
  });
}
