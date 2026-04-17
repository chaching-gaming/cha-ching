import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Warning, X } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Button } from '@/components/ui/button';
import { useResolveDispute } from '@/hooks/use-resolve-dispute';
import { getRpcErrorMessage } from '@/hooks/use-rooms';
import type { BetWithProfiles } from '@/hooks/use-activity-feed';

type Props = {
  visible: boolean;
  onClose: () => void;
  bet: BetWithProfiles;
  roomId: string;
};

export function ResolveDisputeSheet({ visible, onClose, bet, roomId }: Props) {
  const safeInsets = useSafeAreaInsets();
  const resolveDispute = useResolveDispute();
  const [selected, setSelected] = useState<string | null>(null);

  const options = useMemo(() => {
    const raw = Array.isArray(bet.options) ? (bet.options as unknown[]) : [];
    return raw.filter((o): o is string => typeof o === 'string' && o.trim().length > 0);
  }, [bet.options]);

  const offererName = bet.offered_by_profile?.display_name ?? 'Offerer';
  const acceptorName = bet.accepted_by_profile?.display_name ?? 'Acceptor';

  const offererSubmission = useMemo(
    () => bet.outcome_submissions.find((s) => s.user_id === bet.offered_by),
    [bet.outcome_submissions, bet.offered_by],
  );
  const acceptorSubmission = useMemo(
    () => bet.outcome_submissions.find((s) => s.user_id === bet.accepted_by),
    [bet.outcome_submissions, bet.accepted_by],
  );

  const handleClose = useCallback(() => {
    if (resolveDispute.isPending) return;
    setSelected(null);
    onClose();
  }, [resolveDispute.isPending, onClose]);

  const handleSubmit = useCallback(() => {
    if (!selected) return;
    Alert.alert(
      'Resolve this dispute?',
      `You're setting the final outcome to "${selected}". This settles the bet and cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve',
          style: 'default',
          onPress: async () => {
            try {
              await resolveDispute.mutateAsync({
                p_bet_id: bet.id,
                p_final_option: selected,
                roomId,
              });
              setSelected(null);
              onClose();
            } catch (err) {
              Alert.alert(
                'Could not resolve dispute',
                getRpcErrorMessage(err, 'Please try again.'),
              );
            }
          },
        },
      ],
    );
  }, [bet.id, onClose, roomId, selected, resolveDispute]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable
        className="flex-1 justify-end bg-black/65"
        onPress={handleClose}
        disabled={resolveDispute.isPending}
      >
        <Pressable
          className="rounded-t-3xl border-t border-border bg-background px-5 pt-4"
          style={{ paddingBottom: Math.max(safeInsets.bottom, 20) }}
          onPress={(e) => e.stopPropagation()}
        >
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Warning size={22} color={colors.warning} weight="fill" />
              <Text className="text-xl font-bold text-white">Resolve dispute</Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              disabled={resolveDispute.isPending}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text className="mb-1 text-sm font-medium text-text-secondary">Question</Text>
          <Text className="mb-4 text-base leading-6 text-white">{bet.question}</Text>

          <Text className="mb-2 text-sm font-medium text-text-secondary">What they reported</Text>
          <View className="mb-5 gap-2">
            <View className="flex-row items-center justify-between rounded-xl border border-border bg-surface-light px-3 py-2.5">
              <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                {offererName}
              </Text>
              <Text className="text-sm font-bold text-primary" numberOfLines={1}>
                {offererSubmission?.selected_option ?? '—'}
              </Text>
            </View>
            <View className="flex-row items-center justify-between rounded-xl border border-border bg-surface-light px-3 py-2.5">
              <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                {acceptorName}
              </Text>
              <Text className="text-sm font-bold text-error" numberOfLines={1}>
                {acceptorSubmission?.selected_option ?? '—'}
              </Text>
            </View>
          </View>

          <Text className="mb-2 text-sm font-medium text-text-secondary">Your verdict</Text>
          <View className="mb-5 gap-2">
            {options.map((option) => {
              const isSelected = selected === option;
              return (
                <TouchableOpacity
                  key={option}
                  onPress={() => setSelected(option)}
                  disabled={resolveDispute.isPending}
                  activeOpacity={0.75}
                  className={`flex-row items-center justify-between rounded-2xl border-2 px-4 py-3.5 ${
                    isSelected ? 'border-primary bg-primary/10' : 'border-border bg-surface'
                  }`}
                >
                  <Text
                    className={`text-base font-semibold ${isSelected ? 'text-primary' : 'text-white'}`}
                  >
                    {option}
                  </Text>
                  {isSelected ? <Check size={22} color={colors.primary} weight="bold" /> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <Button onPress={handleSubmit} disabled={!selected} loading={resolveDispute.isPending}>
            Resolve and settle
          </Button>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
