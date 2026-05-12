import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Coins, HandHeart, Hourglass } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import { RequestChipsSheet } from '@/components/activity/request-chips-sheet';
import type { RoomMemberWithProfile } from '@/hooks/use-rooms';
import { balanceColorClass, formatBalance } from '@/lib/format-balance';

interface RoomHeaderBarProps {
  members: RoomMemberWithProfile[];
  balance: number;
  onOpenStandings: () => void;
  /** Room id — required to post a chip request. */
  roomId?: string;
  /** Active session — request button is hidden when the session has ended. */
  roomActive?: boolean;
  /** Whether the current user already has an OPEN chip request in this room. */
  hasOpenRequest?: boolean;
}

const MAX_AVATARS = 5;

export function RoomHeaderBar({
  members,
  balance,
  onOpenStandings,
  roomId,
  roomActive,
  hasOpenRequest,
}: RoomHeaderBarProps) {
  const [requestOpen, setRequestOpen] = useState(false);
  const visible = members.slice(0, MAX_AVATARS);
  const overflow = members.length - MAX_AVATARS;

  // Show request button when balance is zero or less (fund me feature)
  const atZero = balance <= 0;
  const showRequestButton = !!roomActive && atZero && !hasOpenRequest && !!roomId;
  const showPendingHint = !!roomActive && atZero && hasOpenRequest;

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
          className="mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-3"
        >
          <HandHeart size={18} color={colors.primary} weight="fill" />
          <Text className="text-sm font-bold text-primary">Request chips</Text>
        </TouchableOpacity>
      ) : showPendingHint ? (
        <View className="mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface-light py-3">
          <Hourglass size={16} color={colors.textMuted} weight="fill" />
          <Text className="text-sm font-semibold text-text-muted">
            Chip request pending in feed
          </Text>
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
