import { useCallback, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { Coins, HandHeart, UsersThree, X } from 'phosphor-react-native';

import { useTheme } from '@/providers/theme';
import { Avatar } from '@/components/ui/avatar';
import { RequestChipsSheet } from '@/components/activity/request-chips-sheet';
import { useCancelChipRequest } from '@/hooks/use-chip-requests';
import { getRpcErrorMessage } from '@/hooks/use-rooms';
import type { RoomMemberWithProfile } from '@/hooks/use-rooms';
import type { ChipRequestWithProfile } from '@/hooks/use-activity-feed';
import { balanceColorClass, formatBalance } from '@/lib/format-balance';

interface RoomHeaderBarProps {
  members: RoomMemberWithProfile[];
  balance: number;
  onOpenStandings: () => void;
  /** Room id — required to post a chip request. */
  roomId?: string;
  /** Active session — request button is hidden when the session has ended. */
  roomActive?: boolean;
  /** The current user's open chip request, if any. */
  myOpenChipRequest?: ChipRequestWithProfile | null;
  /** Whether the current user is an active member (not left/removed). */
  isActiveMember?: boolean;
}

const MAX_AVATARS = 5;

export function RoomHeaderBar({
  members,
  balance,
  onOpenStandings,
  roomId,
  roomActive,
  myOpenChipRequest,
  isActiveMember = true,
}: RoomHeaderBarProps) {
  const { colors } = useTheme();
  const [requestOpen, setRequestOpen] = useState(false);
  const cancelRequest = useCancelChipRequest();
  const visible = members.slice(0, MAX_AVATARS);
  const overflow = members.length - MAX_AVATARS;

  // Show request button when balance is 100 or below (fund me feature)
  // Only active members can request chips
  const lowBalance = balance <= 100;
  const hasOpenRequest = !!myOpenChipRequest;
  const showRequestButton = !!roomActive && isActiveMember && lowBalance && !hasOpenRequest && !!roomId;
  const showPendingStatus = !!roomActive && isActiveMember && hasOpenRequest && !!roomId;

  // Progress calculation for open request
  const requested = myOpenChipRequest?.requested_amount ?? 0;
  const fulfilled = myOpenChipRequest?.fulfilled_amount ?? 0;
  const progressPercent = requested > 0 ? Math.min(100, Math.round((fulfilled / requested) * 100)) : 0;

  const handleCancel = useCallback(() => {
    if (!roomId || !myOpenChipRequest) return;
    Alert.alert('Cancel chip request?', 'Your request will be removed.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelRequest.mutateAsync({
              p_chip_request_id: myOpenChipRequest.id,
              roomId,
            });
          } catch (err) {
            Alert.alert('Could not cancel', getRpcErrorMessage(err, 'Please try again.'));
          }
        },
      },
    ]);
  }, [cancelRequest, myOpenChipRequest, roomId]);

  return (
    <View className="py-4">
      <View className="flex-row items-center justify-between">
        {/* Member avatars — tap to open chip standings */}
        <TouchableOpacity
          onPress={onOpenStandings}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open chip standings"
          className="items-start"
        >
          <View className="flex-row items-center">
            {visible.length > 0 ? (
              <>
                {visible.map((member, index) => (
                  <View
                    key={member.id}
                    className={`rounded-full border-2 border-background ${index > 0 ? '-ml-2.5' : ''}`}
                    style={{ zIndex: MAX_AVATARS - index }}
                  >
                    <Avatar
                      uri={member.profiles?.avatar_url}
                      fallback={member.profiles?.display_name ?? '?'}
                      size="md"
                    />
                  </View>
                ))}
                {overflow > 0 && (
                  <View className="-ml-2.5 h-12 w-12 items-center justify-center rounded-full border-2 border-background bg-surface-light">
                    <Text className="text-sm font-semibold text-text-secondary">+{overflow}</Text>
                  </View>
                )}
              </>
            ) : (
              <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-light">
                <UsersThree size={22} color={colors.textMuted} weight="fill" />
              </View>
            )}
          </View>
          <Text className="mt-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Standings
          </Text>
        </TouchableOpacity>

        {/* Balance */}
        <View className="items-end">
          <Text className="text-base text-text-muted">Your Balance</Text>
          <View className="flex-row items-center gap-1.5">
            <Coins size={22} color={colors.chipsIcon} weight="fill" />
            <Text className={`text-2xl font-bold ${balanceColorClass(balance)}`}>
              {formatBalance(balance)}
            </Text>
          </View>
        </View>
      </View>

      {showRequestButton ? (
        <TouchableOpacity
          onPress={() => setRequestOpen(true)}
          activeOpacity={0.85}
          accessibilityLabel="Request chips from the room"
          className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-warning py-3"
        >
          <HandHeart size={18} color="#FFFFFF" weight="fill" />
          <Text className="text-sm font-bold text-white">Request chips</Text>
        </TouchableOpacity>
      ) : showPendingStatus ? (
        <View className="mt-3 rounded-xl border border-border bg-surface-light px-4 py-3">
          {/* Progress info */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <HandHeart size={18} color={colors.primary} weight="fill" />
              <Text className="text-sm font-semibold text-text-primary">Your chip request</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <Coins size={16} color={colors.chipsIcon} weight="fill" />
              <Text className="text-sm font-semibold text-text-primary">
                {fulfilled.toLocaleString('en-US')}
                <Text className="text-text-secondary"> / {requested.toLocaleString('en-US')}</Text>
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <View className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
            <View
              className="h-full rounded-full bg-primary"
              style={{ width: `${progressPercent}%` }}
            />
          </View>

          {/* Cancel button */}
          <TouchableOpacity
            onPress={handleCancel}
            disabled={cancelRequest.isPending}
            activeOpacity={0.8}
            accessibilityLabel="Cancel your chip request"
            className="mt-3 flex-row items-center justify-center gap-2 rounded-lg border border-border bg-surface py-2.5"
          >
            <X size={16} color={colors.textMuted} weight="bold" />
            <Text className="text-sm font-semibold text-text-muted">
              {cancelRequest.isPending ? 'Cancelling...' : 'Cancel request'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {showRequestButton && roomId ? (
        <RequestChipsSheet
          visible={requestOpen}
          onClose={() => setRequestOpen(false)}
          roomId={roomId}
          currentBalance={balance}
        />
      ) : null}
    </View>
  );
}
