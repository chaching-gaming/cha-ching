import { useMemo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import {
  Handshake,
  Trophy,
  Warning,
  Timer,
  HandCoins,
  Coins,
  UserPlus,
  TrendDown,
  Prohibit,
  PlusCircle,
  type IconProps,
} from 'phosphor-react-native';

import { useTheme, type ThemeColors } from '@/providers/theme';
import { formatRelativeActivityTime } from '@/lib/date-format';
import type { NotificationRow, NotificationType } from '@/hooks/use-notifications-feed';

const NOTIFICATION_ICONS: Record<NotificationType, React.ComponentType<IconProps>> = {
  bet_created: PlusCircle,
  bet_matched: Handshake,
  bet_settled: Trophy,
  bet_won: Trophy,
  bet_lost: TrendDown,
  bet_voided: Prohibit,
  bet_disputed: Warning,
  bet_expiring: Timer,
  chip_request_created: HandCoins,
  chip_donated: Coins,
  bet_accepted: UserPlus,
};

function getIconColors(colors: ThemeColors): Record<NotificationType, string> {
  return {
    bet_created: colors.primary,
    bet_matched: colors.primary,
    bet_settled: colors.primary,
    bet_won: colors.success,
    bet_lost: colors.error,
    bet_voided: colors.textMuted,
    bet_disputed: colors.warning,
    bet_expiring: colors.warning,
    chip_request_created: colors.chipsIcon,
    chip_donated: colors.chipsIcon,
    bet_accepted: colors.primary,
  };
}

interface NotificationItemProps {
  notification: NotificationRow;
  onPress: () => void;
  isLast?: boolean;
}

export function NotificationItem({ notification, onPress, isLast: _isLast }: NotificationItemProps) {
  const { colors } = useTheme();
  const iconColors = useMemo(() => getIconColors(colors), [colors]);
  const Icon = NOTIFICATION_ICONS[notification.type];
  const iconColor = iconColors[notification.type];
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
          className={`text-base ${isUnread ? 'font-bold' : 'font-semibold'} text-text-primary`}
          numberOfLines={1}
        >
          {notification.title}
        </Text>
        <Text className="mt-1 text-sm leading-5 text-text-secondary" numberOfLines={2}>
          {notification.body}
        </Text>
        <Text className="mt-2 text-xs text-text-muted">
          {formatRelativeActivityTime(notification.created_at)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

