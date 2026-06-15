import { Text, View } from 'react-native';

interface NotificationBadgeProps {
  count: number;
}

export function NotificationBadge({ count }: NotificationBadgeProps) {
  if (count <= 0) return null;

  const displayCount = count > 99 ? '99+' : count.toString();

  return (
    <View className="absolute -right-1 -top-1 min-w-[18px] items-center justify-center rounded-full bg-error px-1 py-0.5">
      <Text className="text-[10px] font-bold text-background">{displayCount}</Text>
    </View>
  );
}
