import { Text, TouchableOpacity, View } from 'react-native';
import {
  Handshake,
  Trophy,
  Warning,
  Timer,
  HandCoins,
  Coins,
  UserPlus,
  type IconProps,
} from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import type { NotificationRow, NotificationType } from '@/hooks/use-notifications-feed';

const NOTIFICATION_ICONS: Record<NotificationType, React.ComponentType<IconProps>> = {
  bet_matched: Handshake,
  bet_settled: Trophy,
  bet_disputed: Warning,
  bet_expiring: Timer,
  chip_request_created: HandCoins,
  chip_donated: Coins,
  bet_accepted: UserPlus,
};

const ICON_COLORS: Record<NotificationType, string> = {
  bet_matched: colors.primary,
  bet_settled: colors.primary,
  bet_disputed: colors.warning,
  bet_expiring: colors.warning,
  chip_request_created: colors.chipsIcon,
  chip_donated: colors.chipsIcon,
  bet_accepted: colors.primary,
};

interface NotificationItemProps {
  notification: NotificationRow;
  onPress: () => void;
  isLast?: boolean;
}

export function NotificationItem({ notification, onPress, isLast: _isLast }: NotificationItemProps) {
  const Icon = NOTIFICATION_ICONS[notification.type];
  const iconColor = ICON_COLORS[notification.type];
  const isUnread = notification.read_at === null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`mx-4 mb-3 flex-row items-start gap-3 rounded-xl p-4 ${
        isUnread ? 'bg-surface' : 'bg-surface/60'
      }`}
    >
      {/* Unread indicator dot */}
      {isUnread && (
        <View className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-primary" />
      )}

      {/* Icon */}
      <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-light">
        <Icon size={24} color={iconColor} weight="fill" />
      </View>

      {/* Content */}
      <View className="min-w-0 flex-1 pr-4">
        <Text
          className={`text-base ${isUnread ? 'font-bold' : 'font-semibold'} text-white`}
          numberOfLines={1}
        >
          {notification.title}
        </Text>
        <Text className="mt-1 text-sm leading-5 text-text-secondary" numberOfLines={2}>
          {notification.body}
        </Text>
        <Text className="mt-2 text-xs text-text-muted">
          {formatRelativeTime(notification.created_at)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
