import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { Coins, HandCoins, HandHeart, X } from 'phosphor-react-native';

import { useTheme } from '@/providers/theme';
import { Avatar } from '@/components/ui/avatar';
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
  /** Whether the current user is an active member (not left/removed). */
  isActiveMember?: boolean;
};

export function ChipRequestsSheet({
  visible,
  onClose,
  chipRequests,
  currentUserId,
  roomId,
  roomActive,
  currentUserBalance,
  isActiveMember = true,
}: Props) {
  const { colors } = useTheme();
  const safeInsets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [selectedRequest, setSelectedRequest] = useState<ChipRequestWithProfile | null>(null);

  // Split chip requests into active (OPEN) and completed (FULFILLED, CANCELLED)
  const activeRequests = useMemo(
    () => chipRequests.filter((r) => r.status === 'OPEN'),
    [chipRequests],
  );
  const completedRequests = useMemo(
    () => chipRequests.filter((r) => r.status !== 'OPEN'),
    [chipRequests],
  );

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
        <BottomSheetScrollView
          style={{ paddingHorizontal: 20, paddingTop: 4 }}
          contentContainerStyle={{ paddingBottom: bottomInset }}
        >
          {/* Header */}
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <HandHeart size={22} color={colors.primary} weight="fill" />
              <Text className="text-xl font-bold text-text-primary">Chip Requests</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Empty state */}
          {chipRequests.length === 0 ? (
            <View className="items-center py-8">
              <Text className="text-base text-text-secondary">No chip requests yet</Text>
            </View>
          ) : (
            <>
              {/* Active Requests Section */}
              {activeRequests.length > 0 && (
                <View className="mb-4">
                  <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
                    Active Requests ({activeRequests.length})
                  </Text>
                  {activeRequests.map((item, index) => (
                    <View key={item.id} className={index > 0 ? 'mt-3' : ''}>
                      <ChipRequestRow
                        chipRequest={item}
                        currentUserId={currentUserId}
                        roomActive={roomActive}
                        currentUserBalance={currentUserBalance}
                        isActiveMember={isActiveMember}
                        onDonate={() => handleDonate(item)}
                      />
                    </View>
                  ))}
                </View>
              )}

              {/* Completed Requests Section */}
              {completedRequests.length > 0 && (
                <View>
                  <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">
                    Completed ({completedRequests.length})
                  </Text>
                  {completedRequests.map((item, index) => (
                    <View key={item.id} className={index > 0 ? 'mt-3' : ''}>
                      <ChipRequestRow
                        chipRequest={item}
                        currentUserId={currentUserId}
                        roomActive={roomActive}
                        currentUserBalance={currentUserBalance}
                        isActiveMember={isActiveMember}
                        onDonate={() => handleDonate(item)}
                        dimmed
                      />
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </BottomSheetScrollView>
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
  isActiveMember = true,
  onDonate,
  dimmed = false,
}: {
  chipRequest: ChipRequestWithProfile;
  currentUserId: string | null;
  roomActive: boolean;
  currentUserBalance: number;
  isActiveMember?: boolean;
  onDonate: () => void;
  dimmed?: boolean;
}) {
  const { colors } = useTheme();
  const requesterName = chipRequest.requested_by_profile?.display_name ?? 'Someone';
  const requested = chipRequest.requested_amount;
  const fulfilled = chipRequest.fulfilled_amount;
  const remaining = Math.max(0, requested - fulfilled);
  const progressPercent =
    requested > 0 ? Math.min(100, Math.round((fulfilled / requested) * 100)) : 0;

  const isRequester = !!currentUserId && chipRequest.requested_by === currentUserId;
  const isOpen = chipRequest.status === 'OPEN';
  const canDonate =
    roomActive &&
    isActiveMember &&
    isOpen &&
    !!currentUserId &&
    !isRequester &&
    remaining > 0 &&
    currentUserBalance > 0;

  // Status badge for completed requests
  const statusBadge = !isOpen && (
    <View
      className={`ml-2 rounded-full px-2 py-0.5 ${
        chipRequest.status === 'FULFILLED' ? 'bg-success/20' : 'bg-text-muted/20'
      }`}
    >
      <Text
        className={`text-[10px] font-bold uppercase ${
          chipRequest.status === 'FULFILLED' ? 'text-success' : 'text-text-muted'
        }`}
      >
        {chipRequest.status === 'FULFILLED' ? 'Fulfilled' : 'Cancelled'}
      </Text>
    </View>
  );

  return (
    <View
      className="rounded-xl border border-border bg-surface px-4 py-3"
      style={dimmed ? { opacity: 0.6 } : undefined}
    >
      <View className="flex-row items-center gap-3">
        <Avatar
          uri={chipRequest.requested_by_profile?.avatar_url}
          fallback={requesterName.charAt(0)}
          size="md"
        />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center">
            <Text className="text-base font-semibold text-text-primary" numberOfLines={1}>
              {requesterName}
              {isRequester ? (
                <Text className="text-text-secondary"> (you)</Text>
              ) : null}
            </Text>
            {statusBadge}
          </View>
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
            <Text className="text-sm font-semibold text-text-primary">
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
          <HandCoins size={16} color="#FFFFFF" weight="bold" />
          <Text className="text-sm font-bold text-white">Donate</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
