import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { Check, Clock, CheckCircle, Warning } from 'phosphor-react-native';

import { useTheme, type ThemeColors } from '@/providers/theme';
import type { SettlementStatus } from '@/hooks/use-activity-feed';

type Props = {
  visible: boolean;
  onClose: () => void;
  currentStatus: SettlementStatus | null;
  memberName: string;
  onSelectStatus: (status: SettlementStatus) => void;
};

function getStatusOptions(colors: ThemeColors) {
  return [
    {
      key: 'PENDING' as SettlementStatus,
      label: 'Pending',
      description: 'Settlement not yet completed',
      icon: Clock,
      color: colors.warning,
    },
    {
      key: 'SETTLED' as SettlementStatus,
      label: 'Settled',
      description: 'Balance has been settled',
      icon: CheckCircle,
      color: colors.primary,
    },
    {
      key: 'DISPUTED' as SettlementStatus,
      label: 'Disputed',
      description: 'Settlement is disputed',
      icon: Warning,
      color: colors.error,
    },
  ];
}

export function SettlementStatusSheet({
  visible,
  onClose,
  currentStatus,
  memberName,
  onSelectStatus,
}: Props) {
  const { colors } = useTheme();
  const safeInsets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const statusOptions = useMemo(() => getStatusOptions(colors), [colors]);

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
    (status: SettlementStatus) => {
      sheetRef.current?.dismiss();
      onSelectStatus(status);
    },
    [onSelectStatus],
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
        <Text className="mb-1 px-1 text-xl font-bold text-text-primary">Settlement Status</Text>
        <Text className="mb-3 px-1 text-sm text-text-secondary">{memberName}</Text>
        <View className="overflow-hidden rounded-2xl border border-border bg-surface">
          {statusOptions.map((option, idx) => {
            const isSelected = currentStatus === option.key;
            const Icon = option.icon;
            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => handleOptionPress(option.key)}
                activeOpacity={0.75}
                className={`flex-row items-center gap-3 px-4 py-4 ${
                  idx < statusOptions.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <View
                  className="h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${option.color}20` }}
                >
                  <Icon size={22} color={option.color} weight="bold" />
                </View>
                <View className="min-w-0 flex-1">
                  <Text
                    className={`text-base font-bold ${
                      isSelected ? 'text-primary' : 'text-text-primary'
                    }`}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                  <Text className="mt-0.5 text-sm text-text-secondary" numberOfLines={1}>
                    {option.description}
                  </Text>
                </View>
                {isSelected ? <Check size={20} color={colors.primary} weight="bold" /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
