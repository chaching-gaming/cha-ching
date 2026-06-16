import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X } from 'phosphor-react-native';

import { useTheme } from '@/providers/theme';
import { Button } from '@/components/ui/button';
import { useSubmitOutcome } from '@/hooks/use-submit-outcome';
import { getRpcErrorMessage } from '@/hooks/use-rooms';
import type { BetWithProfiles } from '@/hooks/use-activity-feed';

type Props = {
  visible: boolean;
  onClose: () => void;
  bet: BetWithProfiles;
  roomId: string;
  /** Contextual label for "Yes" option (e.g., "Hit", "Make") - falls back to "Yes" */
  positiveLabel?: string;
  /** Contextual label for "No" option (e.g., "Miss") - falls back to "No" */
  negativeLabel?: string;
};

export function SubmitOutcomeSheet({
  visible,
  onClose,
  bet,
  roomId,
  positiveLabel,
  negativeLabel,
}: Props) {
  const { colors } = useTheme();
  const safeInsets = useSafeAreaInsets();
  const submitOutcome = useSubmitOutcome();
  const [selected, setSelected] = useState<string | null>(null);

  const options = useMemo(() => {
    const raw = Array.isArray(bet.options) ? (bet.options as unknown[]) : [];
    return raw.filter((o): o is string => typeof o === 'string' && o.trim().length > 0);
  }, [bet.options]);

  // Map raw option (Yes/No) to contextual display label
  const getDisplayLabel = useCallback(
    (rawOption: string): string => {
      if (!positiveLabel && !negativeLabel) return rawOption;
      const lower = rawOption.trim().toLowerCase();
      if (lower === 'yes' && positiveLabel) return positiveLabel;
      if (lower === 'no' && negativeLabel) return negativeLabel;
      return rawOption;
    },
    [positiveLabel, negativeLabel],
  );

  const handleClose = useCallback(() => {
    if (submitOutcome.isPending) return;
    setSelected(null);
    onClose();
  }, [submitOutcome.isPending, onClose]);

  const handleSubmit = useCallback(() => {
    if (!selected) return;
    Alert.alert(
      'Submit outcome?',
      `You're reporting "${getDisplayLabel(selected)}" as the result. This can't be changed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          style: 'default',
          onPress: async () => {
            try {
              await submitOutcome.mutateAsync({
                p_bet_id: bet.id,
                p_selected_option: selected,
                roomId,
              });
              setSelected(null);
              onClose();
            } catch (err) {
              Alert.alert('Could not submit outcome', getRpcErrorMessage(err, 'Please try again.'));
            }
          },
        },
      ],
    );
  }, [bet.id, onClose, roomId, selected, submitOutcome, getDisplayLabel]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable
        className="flex-1 justify-end bg-black/65"
        onPress={handleClose}
        disabled={submitOutcome.isPending}
      >
        <Pressable
          className="rounded-t-3xl border-t border-border bg-background px-5 pt-4"
          style={{ paddingBottom: Math.max(safeInsets.bottom, 20) }}
          onPress={(e) => e.stopPropagation()}
        >
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-xl font-bold text-text-primary">Submit outcome</Text>
            <TouchableOpacity
              onPress={handleClose}
              disabled={submitOutcome.isPending}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text className="mb-1 text-sm font-medium text-text-secondary">Question</Text>
          <Text className="mb-5 text-base leading-6 text-text-primary">{bet.question}</Text>

          <Text className="mb-2 text-sm font-medium text-text-secondary">What happened?</Text>
          <View className="mb-5 gap-2">
            {options.map((option) => {
              const isSelected = selected === option;
              return (
                <TouchableOpacity
                  key={option}
                  onPress={() => setSelected(option)}
                  disabled={submitOutcome.isPending}
                  activeOpacity={0.75}
                  className={`flex-row items-center justify-between rounded-2xl border-2 px-4 py-3.5 ${
                    isSelected ? 'border-primary bg-primary/10' : 'border-border bg-surface'
                  }`}
                >
                  <Text
                    className={`text-base font-semibold ${isSelected ? 'text-primary' : 'text-text-primary'}`}
                  >
                    {getDisplayLabel(option)}
                  </Text>
                  {isSelected ? <Check size={22} color={colors.primary} weight="bold" /> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <Button onPress={handleSubmit} disabled={!selected} loading={submitOutcome.isPending}>
            Submit outcome
          </Button>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
