import { Image, Text, TouchableOpacity, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

const sizes = {
  sm: { container: 'h-8 w-8', text: 'text-sm', icon: 14 },
  md: { container: 'h-12 w-12', text: 'text-lg', icon: 20 },
  lg: { container: 'h-20 w-20', text: 'text-2xl', icon: 32 },
} as const;

interface AvatarProps {
  uri?: string | null;
  fallback?: string | null;
  size?: keyof typeof sizes;
  onPress?: () => void;
  showEditBadge?: boolean;
  className?: string;
}

export function Avatar({
  uri,
  fallback,
  size = 'md',
  onPress,
  showEditBadge = false,
  className = '',
}: AvatarProps) {
  const s = sizes[size];
  const initial = fallback?.charAt(0).toUpperCase() ?? '?';

  const content = (
    <View className={`relative ${className}`}>
      {uri ? (
        <Image source={{ uri }} className={`${s.container} rounded-full`} />
      ) : (
        <View
          className={`${s.container} items-center justify-center rounded-full bg-surface-light`}
        >
          <Text className={`${s.text} font-semibold text-text-secondary`}>{initial}</Text>
        </View>
      )}
      {showEditBadge && (
        <View className="absolute bottom-0 right-0 h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-primary">
          <FontAwesome name="pencil" size={12} color="#fff" />
        </View>
      )}
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
