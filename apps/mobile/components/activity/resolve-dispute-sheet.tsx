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
  const isDispute = bet.status === 'DISPUTED';

  const options = useMemo(() => {
    const raw = Array.isArray(bet.options) ? (bet.options as unknown[]) : [];
    return raw.filter((o): o is string => typeof o === 'string' && o.trim().length > 0);
  }, [bet.options]);

  // Group submissions by the option they chose, so the attestor sees "4 said
  // Yes · 2 said No" rather than the old fixed two-row offerer/acceptor view.
  const submissionsByOption = useMemo(() => {
    const out: Record<string, number> = {};
    for (const option of options) out[option] = 0;
    for (const sub of bet.outcome_submissions ?? []) {
      const key = options.find(
        (o) => o.trim().toLowerCase() === sub.selected_option.trim().toLowerCase(),
      );
      if (key) out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  }, [bet.outcome_submissions, options]);

  const totalSubmissions = bet.outcome_submissions?.length ?? 0;

  const handleClose = useCallback(() => {
    if (resolveDispute.isPending) return;
    setSelected(null);
    onClose();
  }, [resolveDispute.isPending, onClose]);

  const handleSubmit = useCallback(() => {
    if (!selected) return;
    Alert.alert(
      isDispute ? 'Resolve this dispute?' : 'Settle this bet?',
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
  }, [bet.id, onClose, roomId, selected, resolveDispute, isDispute]);

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
              {isDispute ? (
                <Warning size={22} color={colors.warning} weight="fill" />
              ) : (
                <Check size={22} color={colors.primary} weight="fill" />
              )}
              <Text className="text-xl font-bold text-white">
                {isDispute ? 'Resolve dispute' : 'Settle bet'}
              </Text>
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

          <Text className="mb-2 text-sm font-medium text-text-secondary">
            Participants reported ({totalSubmissions})
          </Text>
          <View className="mb-5 gap-2">
            {options.map((option, idx) => {
              const count = submissionsByOption[option] ?? 0;
              const tone = idx === 0 ? 'text-primary' : 'text-error';
              return (
                <View
                  key={option}
                  className="flex-row items-center justify-between rounded-xl border border-border bg-surface-light px-3 py-2.5"
                >
                  <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                    {option}
                  </Text>
                  <Text className={`text-sm font-bold ${tone}`} numberOfLines={1}>
                    {count === 0 ? 'no votes' : count === 1 ? '1 vote' : `${count} votes`}
                  </Text>
                </View>
              );
            })}
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
            {isDispute ? 'Resolve and settle' : 'Settle bet'}
          </Button>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
