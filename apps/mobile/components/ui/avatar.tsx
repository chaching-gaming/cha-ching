import { Image, Text, TouchableOpacity, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { useTheme } from '@/providers/theme';

const sizes = {
  sm: { container: 'h-8 w-8', text: 'text-sm', icon: 14 },
  md: { container: 'h-12 w-12', text: 'text-lg', icon: 20 },
  /** Profile hero; larger than list avatars but compact */
  lg: { container: 'h-14 w-14', text: 'text-lg', icon: 24 },
  /** Bet picker / large tap targets */
  xl: { container: 'h-16 w-16', text: 'text-xl', icon: 28 },
} as const;

interface AvatarProps {
  uri?: string | null;
  fallback?: string | null;
  size?: keyof typeof sizes;
  onPress?: () => void;
  showEditBadge?: boolean;
  className?: string;
  /** When true, avatar appears greyed/faded (for left/removed members) */
  inactive?: boolean;
}

export function Avatar({
  uri,
  fallback,
  size = 'md',
  onPress,
  showEditBadge = false,
  className = '',
  inactive = false,
}: AvatarProps) {
  const { colors } = useTheme();
  const s = sizes[size];
  const initial = fallback?.charAt(0).toUpperCase() ?? '?';

  // Apply grayscale and reduced opacity for inactive (left/removed) members
  const inactiveStyle = inactive ? 'opacity-50' : '';
  const imageStyle = inactive ? { opacity: 0.5 } : {};

  const content = (
    <View className={`relative ${className} ${inactiveStyle}`}>
      {uri ? (
        <Image source={{ uri }} className={`${s.container} rounded-full`} style={imageStyle} />
      ) : (
        <View
          className={`${s.container} items-center justify-center rounded-full bg-surface-light`}
        >
          <Text className={`${s.text} font-semibold text-text-secondary`}>{initial}</Text>
        </View>
      )}
      {showEditBadge && (
        <View className="absolute bottom-0 right-0 h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-primary">
          <FontAwesome name="pencil" size={10} color="#FFFFFF" />
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
