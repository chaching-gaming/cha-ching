import { Text, TouchableOpacity, View } from 'react-native';

interface ListItemProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  className?: string;
}

export function ListItem({ title, subtitle, right, onPress, className = '' }: ListItemProps) {
  const content = (
    <View
      className={`min-h-[48px] flex-row items-center justify-between border-b border-border px-5 py-3.5 ${className}`}
    >
      <View className="flex-1 pr-2">
        <Text className="text-base font-medium text-text-primary">{title}</Text>
        {subtitle && <Text className="mt-0.5 text-sm text-text-secondary">{subtitle}</Text>}
      </View>
      {right && <View className="ml-2 shrink-0">{right}</View>}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}
