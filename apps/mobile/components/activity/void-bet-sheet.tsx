import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Prohibit, Warning, X } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Button } from '@/components/ui/button';
import { useVoidBet } from '@/hooks/use-void-bet';
import { getRpcErrorMessage } from '@/hooks/use-rooms';
import type { BetWithProfiles } from '@/hooks/use-activity-feed';

type Props = {
  visible: boolean;
  onClose: () => void;
  bet: BetWithProfiles;
  roomId: string;
};

export function VoidBetSheet({ visible, onClose, bet, roomId }: Props) {
  const safeInsets = useSafeAreaInsets();
  const voidBet = useVoidBet();
  const [reason, setReason] = useState('');

  const stakes = useMemo(() => bet.stakes ?? [], [bet.stakes]);
  const stakerCount = stakes.length;
  const pool = stakerCount * (bet.stake ?? 0);
  const status = bet.status ?? '';
  const isSettled = status === 'SETTLED';

  const handleClose = useCallback(() => {
    if (voidBet.isPending) return;
    Keyboard.dismiss();
    setReason('');
    onClose();
  }, [voidBet.isPending, onClose]);

  const handleSubmit = useCallback(() => {
    Keyboard.dismiss();
    Alert.alert('Void this bet?', 'This refunds every staker and cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Void',
        style: 'destructive',
        onPress: async () => {
          try {
            await voidBet.mutateAsync({
              p_bet_id: bet.id,
              p_reason: reason.trim() ? reason.trim() : null,
              roomId,
            });
            setReason('');
            onClose();
          } catch (err) {
            Alert.alert('Could not void bet', getRpcErrorMessage(err, 'Please try again.'));
          }
        },
      },
    ]);
  }, [bet.id, onClose, reason, roomId, voidBet]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          className="flex-1 justify-end bg-black/65"
          onPress={handleClose}
          disabled={voidBet.isPending}
        >
          <Pressable
            className="rounded-t-3xl border-t border-border bg-background px-5 pt-4"
            style={{ paddingBottom: Math.max(safeInsets.bottom, 20) }}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="mb-4 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Prohibit size={22} color={colors.error} weight="fill" />
                <Text className="text-xl font-bold text-white">Void bet</Text>
              </View>
              <TouchableOpacity
                onPress={handleClose}
                disabled={voidBet.isPending}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={26} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text className="mb-1 text-sm font-medium text-text-secondary">Question</Text>
            <Text className="mb-4 text-base leading-6 text-white">{bet.question}</Text>

            <View className="mb-4 flex-row items-center justify-between rounded-xl border border-border bg-surface-light px-3 py-2.5">
              <Text className="text-sm font-medium text-text-secondary">
                {stakerCount === 1 ? '1 staker' : `${stakerCount} stakers`}
                {' · '}pool {pool.toLocaleString('en-US')}
              </Text>
              <Text className="text-xs font-bold uppercase tracking-wide text-text-muted">
                {status || 'UNKNOWN'}
              </Text>
            </View>

            {isSettled ? (
              <View className="mb-4 flex-row items-start gap-2 rounded-xl border border-error/40 bg-error/10 px-3 py-2.5">
                <Warning size={18} color={colors.error} weight="fill" style={{ marginTop: 2 }} />
                <Text className="flex-1 text-sm leading-5 text-error">
                  This bet is already settled. Voiding will reverse the payout — the current winner
                  will lose their winnings.
                </Text>
              </View>
            ) : stakerCount > 0 ? (
              <Text className="mb-4 text-sm leading-5 text-text-secondary">
                All {stakerCount === 1 ? '1 staker' : `${stakerCount} stakers`} will be refunded
                their {bet.stake.toLocaleString('en-US')} chip stake.
              </Text>
            ) : (
              <Text className="mb-4 text-sm leading-5 text-text-secondary">
                No chips have been staked on this bet yet.
              </Text>
            )}

            <Text className="mb-2 text-sm font-medium text-text-secondary">Reason (optional)</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              editable={!voidBet.isPending}
              placeholder="Why are you voiding this bet?"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={200}
              textAlignVertical="top"
              className="mb-5 min-h-[80px] rounded-xl border border-border bg-surface-light px-3 py-2.5 text-base text-white"
            />

            <Button variant="danger" onPress={handleSubmit} loading={voidBet.isPending}>
              Void bet
            </Button>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
