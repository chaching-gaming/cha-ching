import { Text, View } from 'react-native';
import { Coins, Handshake, Lightning, Trophy, Timer } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { ActivityItem, BetWithProfiles } from '@/hooks/use-activity-feed';

const ACTIVITY_ICON = 20;

function getRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function getBetAction(bet: BetWithProfiles, currentUserId?: string) {
  const offererName = bet.offered_by_profile?.display_name ?? 'Someone';
  const acceptorName = bet.accepted_by_profile?.display_name ?? 'Someone';

  switch (bet.status) {
    case 'OPEN':
      return {
        icon: <Lightning size={ACTIVITY_ICON} color={colors.primary} weight="fill" />,
        title: `${offererName} offered a bet`,
        badge: { variant: 'success' as const, label: 'Open' },
        avatar: bet.offered_by_profile,
      };
    case 'MATCHED':
      return {
        icon: <Handshake size={ACTIVITY_ICON} color={colors.warning} weight="fill" />,
        title: `${acceptorName} accepted ${offererName}'s bet`,
        badge: { variant: 'default' as const, label: 'Matched' },
        avatar: bet.accepted_by_profile,
      };
    case 'PENDING_RESULT':
      return {
        icon: <Timer size={ACTIVITY_ICON} color={colors.warning} weight="fill" />,
        title: `${offererName} vs ${acceptorName}`,
        badge: { variant: 'default' as const, label: 'Pending' },
        avatar: bet.offered_by_profile,
      };
    case 'SETTLED': {
      const winnerName =
        bet.winner === bet.offered_by
          ? offererName
          : bet.winner === bet.accepted_by
            ? acceptorName
            : 'Someone';
      const isCurrentUserWinner = bet.winner === currentUserId;
      return {
        icon: (
          <Trophy
            size={ACTIVITY_ICON}
            color={isCurrentUserWinner ? colors.primary : colors.error}
            weight="fill"
          />
        ),
        title: `${winnerName} won the bet`,
        badge: {
          variant: (isCurrentUserWinner ? 'success' : 'error') as 'success' | 'error',
          label: isCurrentUserWinner ? 'Won' : 'Lost',
        },
        avatar: bet.winner === bet.offered_by ? bet.offered_by_profile : bet.accepted_by_profile,
      };
    }
    case 'EXPIRED':
    case 'VOID':
      return {
        icon: <Timer size={ACTIVITY_ICON} color={colors.textMuted} />,
        title: `${offererName}'s bet ${bet.status === 'EXPIRED' ? 'expired' : 'was voided'}`,
        badge: { variant: 'default' as const, label: bet.status },
        dimmed: true,
        avatar: bet.offered_by_profile,
      };
    default:
      return {
        icon: <Lightning size={ACTIVITY_ICON} color={colors.textMuted} />,
        title: `${offererName} created a bet`,
        badge: { variant: 'default' as const, label: bet.status ?? '' },
        avatar: bet.offered_by_profile,
      };
  }
}

interface ActivityFeedItemProps {
  item: ActivityItem;
  currentUserId?: string;
}

export function ActivityFeedItem({ item, currentUserId }: ActivityFeedItemProps) {
  if (item.type === 'bet') {
    const { bet } = item;
    const action = getBetAction(bet, currentUserId);
    const dimmed = 'dimmed' in action && action.dimmed;

    return (
      <View className={`flex-row items-start gap-4 py-4 ${dimmed ? 'opacity-50' : ''}`}>
        <Avatar
          uri={action.avatar?.avatar_url}
          fallback={action.avatar?.display_name ?? '?'}
          size="md"
        />
        <View className="flex-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-lg font-medium text-white" numberOfLines={2}>
              {action.title}
            </Text>
            <Badge
              variant={action.badge.variant}
              label={action.badge.label}
              className="px-4 py-2"
              labelClassName="text-sm font-semibold"
            />
          </View>
          <Text className="mt-1 text-base text-text-secondary" numberOfLines={2}>
            {bet.question} &middot; {bet.stake} chips
          </Text>
          <Text className="mt-1 text-sm text-text-muted">{getRelativeTime(item.timestamp)}</Text>
        </View>
      </View>
    );
  }

  // chip_request
  const { chipRequest } = item;
  const requesterName = chipRequest.requested_by_profile?.display_name ?? 'Someone';
  const statusBadge =
    chipRequest.status === 'FULFILLED'
      ? { variant: 'success' as const, label: 'Fulfilled' }
      : chipRequest.status === 'EXPIRED'
        ? { variant: 'default' as const, label: 'Expired' }
        : { variant: 'default' as const, label: 'Open' };

  return (
    <View className="flex-row items-start gap-4 py-4">
      <Avatar
        uri={chipRequest.requested_by_profile?.avatar_url}
        fallback={requesterName.charAt(0)}
        size="md"
      />
      <View className="flex-1">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="flex-1 text-lg font-medium text-white" numberOfLines={2}>
            {requesterName} requested more chips
          </Text>
          <Badge
            variant={statusBadge.variant}
            label={statusBadge.label}
            className="px-4 py-2"
            labelClassName="text-sm font-semibold"
          />
        </View>
        {chipRequest.current_balance != null && (
          <View className="mt-1 flex-row items-center gap-1.5">
            <Coins size={18} color={colors.textMuted} />
            <Text className="text-base text-text-secondary">
              Balance: {chipRequest.current_balance}
            </Text>
          </View>
        )}
        <Text className="mt-1 text-sm text-text-muted">{getRelativeTime(item.timestamp)}</Text>
      </View>
    </View>
  );
}
