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
import { Coins, X } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Button } from '@/components/ui/button';
import { useSetRoomChipLimit } from '@/hooks/use-chip-requests';
import { getRpcErrorMessage } from '@/hooks/use-rooms';

type Props = {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  currentLimit: number | null;
};

const MAX_LIMIT_MAGNITUDE = 1000000;

export function SetChipLimitSheet({ visible, onClose, roomId, currentLimit }: Props) {
  const safeInsets = useSafeAreaInsets();
  const setLimit = useSetRoomChipLimit();

  // Text is signed: leading '-' allowed, otherwise digits only.
  const initialText = currentLimit != null ? String(currentLimit) : '';
  const [text, setText] = useState<string>(initialText);

  useEffect(() => {
    if (visible) setText(currentLimit != null ? String(currentLimit) : '');
  }, [visible, currentLimit]);

  const parsed = useMemo<{ value: number | null; valid: boolean }>(() => {
    const trimmed = text.trim();
    if (trimmed === '' || trimmed === '-') return { value: null, valid: true };
    const n = Number(trimmed);
    if (!Number.isInteger(n)) return { value: null, valid: false };
    if (Math.abs(n) > MAX_LIMIT_MAGNITUDE) return { value: null, valid: false };
    return { value: n, valid: true };
  }, [text]);

  const handleChangeText = useCallback((raw: string) => {
    // Allow a single leading '-' plus digits.
    const sign = raw.startsWith('-') ? '-' : '';
    const digits = raw.replace(/\D/g, '').slice(0, 7);
    setText(`${sign}${digits}`);
  }, []);

  const handleClose = useCallback(() => {
    if (setLimit.isPending) return;
    Keyboard.dismiss();
    onClose();
  }, [setLimit.isPending, onClose]);

  const handleSubmit = useCallback(() => {
    Keyboard.dismiss();
    if (!parsed.valid) return;

    const summary =
      parsed.value == null
        ? 'Remove the chip limit? Members will be able to go into any negative balance.'
        : `Set the chip limit to ${parsed.value.toLocaleString('en-US')} chips?`;

    Alert.alert('Update chip limit', summary, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Save',
        onPress: async () => {
          try {
            await setLimit.mutateAsync({ p_room_id: roomId, p_limit: parsed.value });
            onClose();
          } catch (err) {
            Alert.alert('Could not update', getRpcErrorMessage(err, 'Please try again.'));
          }
        },
      },
    ]);
  }, [parsed, roomId, setLimit, onClose]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          className="flex-1 justify-end bg-black/65"
          onPress={handleClose}
          disabled={setLimit.isPending}
        >
          <Pressable
            className="rounded-t-3xl border-t border-border bg-background px-5 pt-4"
            style={{ paddingBottom: Math.max(safeInsets.bottom, 20) }}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="mb-4 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Coins size={22} color={colors.chipsIcon} weight="fill" />
                <Text className="text-xl font-bold text-white">Chip limit</Text>
              </View>
              <TouchableOpacity
                onPress={handleClose}
                disabled={setLimit.isPending}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={26} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text className="mb-4 text-sm leading-5 text-text-secondary">
              Members can&rsquo;t bet or donate past this balance. Use a negative number for a loss
              floor (e.g. -500). Leave empty for no limit.
            </Text>

            <Text className="mb-2 text-sm font-medium text-text-secondary">Limit</Text>
            <View className="mb-5 flex-row items-center rounded-xl border border-border bg-surface-light px-3 py-2">
              <Coins size={20} color={colors.chipsIcon} weight="fill" />
              <TextInput
                value={text}
                onChangeText={handleChangeText}
                editable={!setLimit.isPending}
                placeholder="None"
                placeholderTextColor={colors.textMuted}
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                selectTextOnFocus
                maxLength={8}
                className="ml-2 flex-1 text-2xl font-bold text-white"
              />
              <Text className="text-base font-medium text-text-secondary">chips</Text>
            </View>

            <Button
              variant="primary"
              onPress={handleSubmit}
              disabled={!parsed.valid}
              loading={setLimit.isPending}
            >
              Save
            </Button>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
