import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Platform, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
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
};

export function DonateChipsSheet({ visible, onClose, chipRequest, roomId, donorBalance }: Props) {
  const safeInsets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const donateChips = useDonateChips();

  const remaining = Math.max(0, chipRequest.requested_amount - chipRequest.fulfilled_amount);

  // Donor's max donation: the smaller of remaining need and their balance
  // (floor is always 0 - can't go negative)
  const maxDonation = Math.max(0, Math.min(remaining, donorBalance));

  // Default: fulfill the remainder when that fits the donor's balance;
  // otherwise max out what they can give rounded down to the nearest 100.
  const suggestedAmount = useMemo(() => {
    if (maxDonation <= 0) return 0;
    if (remaining <= donorBalance) return remaining;
    return Math.floor(maxDonation / 100) * 100 || Math.min(100, maxDonation);
  }, [donorBalance, maxDonation, remaining]);

  const [amountText, setAmountText] = useState<string>(String(suggestedAmount));

  useEffect(() => {
    if (visible) {
      sheetRef.current?.present();
      setAmountText(String(suggestedAmount));
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible, suggestedAmount]);

  const parsedAmount = useMemo(() => {
    const n = parseInt(amountText.replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }, [amountText]);

  const exceedsRemaining = parsedAmount > remaining;
  const exceedsBalance = parsedAmount > donorBalance;
  const amountValid = parsedAmount > 0 && !exceedsRemaining && !exceedsBalance;

  const balanceAfter = donorBalance - parsedAmount;

  const requesterName = chipRequest.requested_by_profile?.display_name ?? 'this member';

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        opacity={0.65}
      />
    ),
    [],
  );

  const handleClose = useCallback(() => {
    if (donateChips.isPending) return;
    Keyboard.dismiss();
    sheetRef.current?.dismiss();
  }, [donateChips.isPending]);

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
              sheetRef.current?.dismiss();
            } catch (err) {
              Alert.alert('Could not donate', getRpcErrorMessage(err, 'Please try again.'));
            }
          },
        },
      ],
    );
  }, [amountValid, balanceAfter, chipRequest.id, donateChips, parsedAmount, roomId]);

  // On Android, use safe area inset for navigation bar clearance.
  // On iOS, use safe area inset as well.
  const bottomInset = Math.max(safeInsets.bottom, 20);

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      enablePanDownToClose
      onDismiss={onClose}
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
      backdropComponent={renderBackdrop}
      keyboardBehavior={Platform.OS === 'ios' ? 'extend' : 'fillParent'}
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetView style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: bottomInset }}>
        <View className="mb-4 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <HandCoins size={22} color={colors.primary} weight="fill" />
            <Text className="text-xl font-bold text-text-primary">Donate chips</Text>
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
            <Text className="text-base font-semibold text-text-primary" numberOfLines={1}>
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
          <BottomSheetTextInput
            value={amountText}
            onChangeText={(t) => setAmountText(t.replace(/\D/g, ''))}
            editable={!donateChips.isPending}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            selectTextOnFocus
            maxLength={6}
            style={{
              marginLeft: 8,
              flex: 1,
              fontSize: 24,
              fontWeight: 'bold',
              color: colors.textPrimary,
            }}
          />
          <Text className="text-base font-medium text-text-secondary">chips</Text>
        </View>

        <View className="mb-5 flex-row items-center justify-between">
          <Text className="text-sm text-text-secondary">
            Your balance after:{' '}
            <Text className={`font-semibold ${balanceAfter < 0 ? 'text-error' : 'text-text-primary'}`}>
              {balanceAfter.toLocaleString('en-US')}
            </Text>
          </Text>
          {exceedsBalance ? (
            <Text className="text-xs font-semibold text-error">Not enough chips</Text>
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
      </BottomSheetView>
    </BottomSheetModal>
  );
}
