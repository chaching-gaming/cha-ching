import { Text, TouchableOpacity, View } from 'react-native';

import type { NotificationRow, NotificationType } from '@/hooks/use-notifications-feed';

export type NotificationFilter = 'all' | 'results' | 'activity';

const OPTIONS: { key: NotificationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'results', label: 'Results' },
  { key: 'activity', label: 'Activity' },
];

// Notification types that represent bet outcomes (wins/losses)
const RESULT_TYPES: NotificationType[] = ['bet_won', 'bet_lost', 'bet_settled'];

// Notification types that represent activity (non-outcome events)
const ACTIVITY_TYPES: NotificationType[] = [
  'bet_created',
  'bet_matched',
  'bet_accepted',
  'bet_disputed',
  'bet_expiring',
  'bet_voided',
  'chip_request_created',
  'chip_donated',
];

interface NotificationFilterProps {
  value: NotificationFilter;
  onChange: (v: NotificationFilter) => void;
}

export function NotificationFilterBar({ value, onChange }: NotificationFilterProps) {
  return (
    <View className="mx-5 mb-3 flex-row gap-2">
      {OPTIONS.map((o) => {
        const active = o.key === value;
        return (
          <TouchableOpacity
            key={o.key}
            onPress={() => onChange(o.key)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`flex-1 items-center justify-center rounded-xl py-2.5 ${
              active ? 'bg-primary' : 'border border-border bg-surface-light'
            }`}
          >
            <Text className={`text-sm font-bold ${active ? 'text-white' : 'text-text-secondary'}`}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function notificationMatchesFilter(
  notification: NotificationRow,
  filter: NotificationFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'results') return RESULT_TYPES.includes(notification.type);
  if (filter === 'activity') return ACTIVITY_TYPES.includes(notification.type);
  return true;
}
