import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { Coins, HandCoins, HandHeart, X } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DonateChipsSheet } from '@/components/activity/donate-chips-sheet';
import type { ChipRequestWithProfile } from '@/hooks/use-activity-feed';

type Props = {
  visible: boolean;
  onClose: () => void;
  chipRequests: ChipRequestWithProfile[];
  currentUserId: string | null;
  roomId: string;
  roomActive: boolean;
  currentUserBalance: number;
};

export function ChipRequestsSheet({
  visible,
  onClose,
  chipRequests,
  currentUserId,
  roomId,
  roomActive,
  currentUserBalance,
}: Props) {
  const safeInsets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [selectedRequest, setSelectedRequest] = useState<ChipRequestWithProfile | null>(null);

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

  const handleDonate = useCallback((request: ChipRequestWithProfile) => {
    setSelectedRequest(request);
  }, []);

  const handleDonateClose = useCallback(() => {
    setSelectedRequest(null);
  }, []);

  const bottomInset = Math.max(safeInsets.bottom, 20);

  return (
    <>
      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        enablePanDownToClose
        onDismiss={onClose}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
        backdropComponent={renderBackdrop}
        maxDynamicContentSize={500}
      >
        <BottomSheetView
          style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: bottomInset }}
        >
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <HandHeart size={22} color={colors.primary} weight="fill" />
              <Text className="text-xl font-bold text-white">Chip Requests</Text>
              <View className="ml-1 rounded-full bg-primary/20 px-2 py-0.5">
                <Text className="text-xs font-bold text-primary">{chipRequests.length}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {chipRequests.length === 0 ? (
            <View className="items-center py-8">
              <Text className="text-base text-text-secondary">No open chip requests</Text>
            </View>
          ) : (
            <FlatList
              data={chipRequests}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <ChipRequestRow
                  chipRequest={item}
                  currentUserId={currentUserId}
                  roomActive={roomActive}
                  currentUserBalance={currentUserBalance}
                  onDonate={() => handleDonate(item)}
                />
              )}
              ItemSeparatorComponent={() => <View className="h-3" />}
            />
          )}
        </BottomSheetView>
      </BottomSheetModal>

      {selectedRequest && (
        <DonateChipsSheet
          visible={!!selectedRequest}
          onClose={handleDonateClose}
          chipRequest={selectedRequest}
          roomId={roomId}
          donorBalance={currentUserBalance}
        />
      )}
    </>
  );
}

function ChipRequestRow({
  chipRequest,
  currentUserId,
  roomActive,
  currentUserBalance,
  onDonate,
}: {
  chipRequest: ChipRequestWithProfile;
  currentUserId: string | null;
  roomActive: boolean;
  currentUserBalance: number;
  onDonate: () => void;
}) {
  const requesterName = chipRequest.requested_by_profile?.display_name ?? 'Someone';
  const requested = chipRequest.requested_amount;
  const fulfilled = chipRequest.fulfilled_amount;
  const remaining = Math.max(0, requested - fulfilled);
  const progressPercent =
    requested > 0 ? Math.min(100, Math.round((fulfilled / requested) * 100)) : 0;

  const isRequester = !!currentUserId && chipRequest.requested_by === currentUserId;
  const canDonate =
    roomActive &&
    !!currentUserId &&
    !isRequester &&
    remaining > 0 &&
    currentUserBalance > 0;

  return (
    <View className="rounded-xl border border-border bg-surface px-4 py-3">
      <View className="flex-row items-center gap-3">
        <Avatar
          uri={chipRequest.requested_by_profile?.avatar_url}
          fallback={requesterName.charAt(0)}
          size="md"
        />
        <View className="min-w-0 flex-1">
          <Text className="text-base font-semibold text-white" numberOfLines={1}>
            {requesterName}
            {isRequester ? (
              <Text className="text-text-secondary"> (you)</Text>
            ) : null}
          </Text>
          {chipRequest.message ? (
            <Text className="mt-0.5 text-sm text-text-secondary" numberOfLines={2}>
              &ldquo;{chipRequest.message}&rdquo;
            </Text>
          ) : null}
        </View>
      </View>

      <View className="mt-3">
        <View className="mb-1.5 flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <Coins size={16} color={colors.chipsIcon} weight="fill" />
            <Text className="text-sm font-semibold text-white">
              {fulfilled.toLocaleString('en-US')}{' '}
              <Text className="text-text-secondary">/ {requested.toLocaleString('en-US')}</Text>
            </Text>
          </View>
          <Text className="text-xs font-bold uppercase tracking-wide text-primary">
            {progressPercent}%
          </Text>
        </View>
        <View className="h-1.5 overflow-hidden rounded-full bg-surface-light">
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${progressPercent}%` }}
          />
        </View>
      </View>

      {canDonate ? (
        <TouchableOpacity
          onPress={onDonate}
          activeOpacity={0.8}
          className="mt-3 flex-row items-center justify-center gap-2 rounded-lg bg-primary py-2.5"
        >
          <HandCoins size={16} color={colors.textPrimary} weight="bold" />
          <Text className="text-sm font-bold text-white">Donate</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
