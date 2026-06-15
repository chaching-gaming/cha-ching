import { useCallback, useEffect, useRef } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { Check } from 'phosphor-react-native';

import { colors } from '@/constants/colors';

export type ActionSheetOption = {
  key: string;
  label: string;
  subtitle?: string;
  icon?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  options: ActionSheetOption[];
  /** Marks the option with this `key` as the current value (check icon, tinted label). */
  selectedKey?: string | null;
};

export function ActionSheet({ visible, onClose, title, options, selectedKey }: Props) {
  const safeInsets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => {
    if (visible) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [visible]);

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

  const handleOptionPress = useCallback(
    (option: ActionSheetOption) => {
      if (option.disabled) return;
      sheetRef.current?.dismiss();
      // Run the action after dismiss starts so the sheet animates out under any
      // follow-up modal (e.g. a share sheet) the action might open.
      option.onPress();
    },
    [],
  );

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
    >
      <BottomSheetView
        style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: bottomInset }}
      >
        {title ? <Text className="mb-3 px-1 text-xl font-bold text-text-primary">{title}</Text> : null}
        <View className="overflow-hidden rounded-2xl border border-border bg-surface">
          {options.map((option, idx) => {
            const isSelected = selectedKey != null && selectedKey === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => handleOptionPress(option)}
                disabled={option.disabled}
                activeOpacity={0.75}
                className={`flex-row items-center gap-3 px-4 py-4 ${
                  idx < options.length - 1 ? 'border-b border-border' : ''
                } ${option.disabled ? 'opacity-50' : ''}`}
              >
                {option.icon ? (
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-light">
                    {option.icon}
                  </View>
                ) : null}
                <View className="min-w-0 flex-1">
                  <Text
                    className={`text-base font-bold ${
                      option.destructive
                        ? 'text-error'
                        : isSelected
                          ? 'text-primary'
                          : 'text-text-primary'
                    }`}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                  {option.subtitle ? (
                    <Text className="mt-0.5 text-sm text-text-secondary" numberOfLines={2}>
                      {option.subtitle}
                    </Text>
                  ) : null}
                </View>
                {isSelected ? (
                  <Check size={20} color={colors.primary} weight="bold" />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
