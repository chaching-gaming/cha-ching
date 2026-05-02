import { Text, TouchableOpacity, View } from 'react-native';
import {
  Handshake,
  Trophy,
  Warning,
  Timer,
  HandCoins,
  Coins,
} from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import type { NotificationRow, NotificationType } from '@/hooks/use-notifications-feed';

const NOTIFICATION_ICONS: Record<NotificationType, React.ComponentType<any>> = {
  bet_matched: Handshake,
  bet_settled: Trophy,
  bet_disputed: Warning,
  bet_expiring: Timer,
  chip_request_created: HandCoins,
  chip_donated: Coins,
};

const ICON_COLORS: Record<NotificationType, string> = {
  bet_matched: colors.primary,
  bet_settled: colors.primary,
  bet_disputed: colors.warning,
  bet_expiring: colors.warning,
  chip_request_created: colors.chipsIcon,
  chip_donated: colors.chipsIcon,
};

interface NotificationItemProps {
  notification: NotificationRow;
  onPress: () => void;
  isLast?: boolean;
}

export function NotificationItem({ notification, onPress, isLast }: NotificationItemProps) {
  const Icon = NOTIFICATION_ICONS[notification.type];
  const iconColor = ICON_COLORS[notification.type];
  const isUnread = notification.read_at === null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`flex-row items-start gap-3 px-5 py-4 ${
        isUnread ? 'bg-surfaceLight/50' : ''
      } ${isLast ? '' : 'border-b border-border'}`}
    >
      {/* Unread indicator dot */}
      {isUnread && (
        <View className="absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary" />
      )}

      {/* Icon */}
      <View className="mt-0.5 h-10 w-10 items-center justify-center rounded-full bg-surfaceLight">
        <Icon size={20} color={iconColor} weight="fill" />
      </View>

      {/* Content */}
      <View className="min-w-0 flex-1">
        <Text
          className={`text-base ${isUnread ? 'font-bold' : 'font-medium'} text-white`}
          numberOfLines={1}
        >
          {notification.title}
        </Text>
        <Text className="mt-0.5 text-sm text-textSecondary" numberOfLines={2}>
          {notification.body}
        </Text>
        <Text className="mt-1 text-xs text-textMuted">
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
