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
import { Coins, HandHeart, X } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Button } from '@/components/ui/button';
import { useRequestChips } from '@/hooks/use-chip-requests';
import { getRpcErrorMessage } from '@/hooks/use-rooms';

type Props = {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  currentBalance: number;
};

const MAX_MESSAGE_LENGTH = 200;
const MAX_AMOUNT = 100000;

export function RequestChipsSheet({ visible, onClose, roomId, currentBalance }: Props) {
  const safeInsets = useSafeAreaInsets();
  const requestChips = useRequestChips();

  // Default suggestion: enough to bring balance back to a reasonable amount.
  // Since minimum is 0, suggest 500 chips (or 100 at minimum), rounded to 100.
  const suggestedAmount = useMemo(() => {
    const target = 500;
    const delta = Math.max(100, target - currentBalance);
    return Math.ceil(delta / 100) * 100;
  }, [currentBalance]);

  const [amountText, setAmountText] = useState<string>(String(suggestedAmount));
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (visible) {
      setAmountText(String(suggestedAmount));
      setMessage('');
    }
  }, [visible, suggestedAmount]);

  const parsedAmount = useMemo(() => {
    const n = parseInt(amountText.replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }, [amountText]);

  const amountValid = parsedAmount > 0 && parsedAmount <= MAX_AMOUNT;

  const handleClose = useCallback(() => {
    if (requestChips.isPending) return;
    Keyboard.dismiss();
    onClose();
  }, [requestChips.isPending, onClose]);

  const handleSubmit = useCallback(() => {
    Keyboard.dismiss();
    if (!amountValid) return;

    Alert.alert(
      'Post this request?',
      `Your room will see you need ${parsedAmount.toLocaleString('en-US')} chips to keep playing.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Post',
          onPress: async () => {
            try {
              await requestChips.mutateAsync({
                p_room_id: roomId,
                p_amount: parsedAmount,
                p_message: message.trim() ? message.trim() : null,
              });
              onClose();
            } catch (err) {
              Alert.alert('Could not post request', getRpcErrorMessage(err, 'Please try again.'));
            }
          },
        },
      ],
    );
  }, [amountValid, message, onClose, parsedAmount, requestChips, roomId]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable
          className="flex-1 justify-end bg-black/65"
          onPress={handleClose}
          disabled={requestChips.isPending}
        >
          <Pressable
            className="rounded-t-3xl border-t border-border bg-background px-5 pt-4"
            style={{ paddingBottom: Math.max(safeInsets.bottom, 20) }}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="mb-4 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <HandHeart size={22} color={colors.primary} weight="fill" />
                <Text className="text-xl font-bold text-white">Request chips</Text>
              </View>
              <TouchableOpacity
                onPress={handleClose}
                disabled={requestChips.isPending}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={26} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View className="mb-4 flex-row items-center justify-between rounded-xl border border-border bg-surface-light px-3 py-2.5">
              <Text className="text-sm font-medium text-text-secondary">Your balance</Text>
              <View className="flex-row items-center gap-1.5">
                <Coins size={18} color={colors.chipsIcon} weight="fill" />
                <Text
                  className={`text-base font-bold ${
                    currentBalance < 0 ? 'text-error' : 'text-white'
                  }`}
                >
                  {currentBalance.toLocaleString('en-US')}
                </Text>
              </View>
            </View>

            <Text className="mb-2 text-sm font-medium text-text-secondary">Amount</Text>
            <View className="mb-4 flex-row items-center rounded-xl border border-border bg-surface-light px-3 py-2">
              <Coins size={20} color={colors.chipsIcon} weight="fill" />
              <TextInput
                value={amountText}
                onChangeText={(t) => setAmountText(t.replace(/\D/g, ''))}
                editable={!requestChips.isPending}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                selectTextOnFocus
                maxLength={6}
                className="ml-2 flex-1 text-2xl font-bold text-white"
              />
              <Text className="text-base font-medium text-text-secondary">chips</Text>
            </View>

            <Text className="mb-2 text-sm font-medium text-text-secondary">Message (optional)</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              editable={!requestChips.isPending}
              placeholder="Tell the room why you need chips…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={MAX_MESSAGE_LENGTH}
              textAlignVertical="top"
              className="mb-5 min-h-[80px] rounded-xl border border-border bg-surface-light px-3 py-2.5 text-base text-white"
            />

            <Button
              variant="primary"
              onPress={handleSubmit}
              disabled={!amountValid}
              loading={requestChips.isPending}
            >
              Post request
            </Button>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
