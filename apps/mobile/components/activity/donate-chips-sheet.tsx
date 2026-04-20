import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Coins, HandCoins, X } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useDonateChips } from '@/hooks/use-chip-requests';
import { getRpcErrorMessage } from '@/hooks/use-rooms';
import type { ChipRequestWithProfile } from '@/hooks/use-activity-feed';

type Props = {
  visible: boolean;
  onClose: () => void;
  chipRequest: ChipRequestWithProfile;
  roomId: string;
  donorBalance: number;
  chipLimit: number | null;
};

export function DonateChipsSheet({
  visible,
  onClose,
  chipRequest,
  roomId,
  donorBalance,
  chipLimit,
}: Props) {
  const safeInsets = useSafeAreaInsets();
  const donateChips = useDonateChips();

  const remaining = Math.max(0, chipRequest.requested_amount - chipRequest.fulfilled_amount);

  // Donor's max donation: the smaller of remaining need and the cushion
  // above their own floor. With no floor, only remaining bounds the amount.
  const donorCushion = chipLimit != null ? donorBalance - chipLimit : Infinity;
  const maxDonation = Math.max(0, Math.min(remaining, donorCushion));

  // Default: fulfill the remainder when that fits the donor's cushion;
  // otherwise max out their cushion rounded down to the nearest 100.
  const suggestedAmount = useMemo(() => {
    if (maxDonation <= 0) return 0;
    if (remaining <= donorCushion) return remaining;
    return Math.floor(maxDonation / 100) * 100 || Math.min(100, maxDonation);
  }, [donorCushion, maxDonation, remaining]);

  const [amountText, setAmountText] = useState<string>(String(suggestedAmount));

  useEffect(() => {
    if (visible) setAmountText(String(suggestedAmount));
  }, [visible, suggestedAmount]);

  const parsedAmount = useMemo(() => {
    const n = parseInt(amountText.replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }, [amountText]);

  const exceedsRemaining = parsedAmount > remaining;
  const exceedsCushion = parsedAmount > donorCushion;
  const amountValid = parsedAmount > 0 && !exceedsRemaining && !exceedsCushion;

  const balanceAfter = donorBalance - parsedAmount;

  const requesterName = chipRequest.requested_by_profile?.display_name ?? 'this member';

  const handleClose = useCallback(() => {
    if (donateChips.isPending) return;
    Keyboard.dismiss();
    onClose();
  }, [donateChips.isPending, onClose]);

  const handleSubmit = useCallback(() => {
    Keyboard.dismiss();
    if (!amountValid) return;

    Alert.alert(
      `Donate ${parsedAmount.toLocaleString('en-US')} chips?`,
      `Your balance after will be ${balanceAfter.toLocaleString('en-US')}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Donate',
          onPress: async () => {
            try {
              await donateChips.mutateAsync({
                p_chip_request_id: chipRequest.id,
                p_amount: parsedAmount,
                roomId,
              });
              onClose();
            } catch (err) {
              Alert.alert('Could not donate', getRpcErrorMessage(err, 'Please try again.'));
            }
          },
        },
      ],
    );
  }, [amountValid, balanceAfter, chipRequest.id, donateChips, onClose, parsedAmount, roomId]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          className="flex-1 justify-end bg-black/65"
          onPress={handleClose}
          disabled={donateChips.isPending}
        >
          <Pressable
            className="rounded-t-3xl border-t border-border bg-background px-5 pt-4"
            style={{ paddingBottom: Math.max(safeInsets.bottom, 20) }}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="mb-4 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <HandCoins size={22} color={colors.primary} weight="fill" />
                <Text className="text-xl font-bold text-white">Donate chips</Text>
              </View>
              <TouchableOpacity
                onPress={handleClose}
                disabled={donateChips.isPending}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={26} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View className="mb-4 flex-row items-center gap-3 rounded-xl border border-border bg-surface-light px-3 py-2.5">
              <Avatar
                uri={chipRequest.requested_by_profile?.avatar_url}
                fallback={requesterName.charAt(0)}
                size="md"
              />
              <View className="min-w-0 flex-1">
                <Text className="text-base font-semibold text-white" numberOfLines={1}>
                  {requesterName}
                </Text>
                <Text className="text-sm text-text-secondary">
                  {remaining.toLocaleString('en-US')} of{' '}
                  {chipRequest.requested_amount.toLocaleString('en-US')} chips still needed
                </Text>
              </View>
            </View>

            <Text className="mb-2 text-sm font-medium text-text-secondary">Donation amount</Text>
            <View className="mb-3 flex-row items-center rounded-xl border border-border bg-surface-light px-3 py-2">
              <Coins size={20} color={colors.chipsIcon} weight="fill" />
              <TextInput
                value={amountText}
                onChangeText={(t) => setAmountText(t.replace(/\D/g, ''))}
                editable={!donateChips.isPending}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                selectTextOnFocus
                maxLength={6}
                className="ml-2 flex-1 text-2xl font-bold text-white"
              />
              <Text className="text-base font-medium text-text-secondary">chips</Text>
            </View>

            <View className="mb-5 flex-row items-center justify-between">
              <Text className="text-sm text-text-secondary">
                Your balance after:{' '}
                <Text className={`font-semibold ${balanceAfter < 0 ? 'text-error' : 'text-white'}`}>
                  {balanceAfter.toLocaleString('en-US')}
                </Text>
              </Text>
              {exceedsCushion ? (
                <Text className="text-xs font-semibold text-error">Past your floor</Text>
              ) : exceedsRemaining ? (
                <Text className="text-xs font-semibold text-error">Over the goal</Text>
              ) : null}
            </View>

            <Button
              variant="primary"
              onPress={handleSubmit}
              disabled={!amountValid}
              loading={donateChips.isPending}
            >
              {parsedAmount > 0
                ? `Donate ${parsedAmount.toLocaleString('en-US')} chips`
                : 'Donate chips'}
            </Button>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
