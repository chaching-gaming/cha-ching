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
      className={`min-h-[44px] flex-row items-center justify-between border-b border-border px-4 py-3 ${className}`}
    >
      <View className="flex-1">
        <Text className="text-base font-medium text-white">{title}</Text>
        {subtitle && <Text className="mt-0.5 text-sm text-text-muted">{subtitle}</Text>}
      </View>
      {right && <View className="ml-3">{right}</View>}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}
