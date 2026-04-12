import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretLeft } from 'phosphor-react-native';

interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
  right?: React.ReactNode;
  /** Override default title typography (default: text-xl font-bold) */
  titleClassName?: string;
  backIconSize?: number;
}

export function ScreenHeader({
  title,
  showBack = false,
  right,
  titleClassName = 'text-xl font-bold text-white',
  backIconSize = 24,
}: ScreenHeaderProps) {
  const router = useRouter();

  // Main tab pages (no back button): left-aligned title
  // Sub-pages (with back button): center-aligned title
  if (!showBack) {
    return (
      <View className="flex-row items-center justify-between bg-background px-5 pb-3 pt-16">
        <Text className={titleClassName}>{title}</Text>
        {right ? <View>{right}</View> : null}
      </View>
    );
  }

  return (
    <View className="flex-row items-center bg-background px-5 pb-3 pt-16">
      {/* Left slot */}
      <View className="w-12 items-start">
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <CaretLeft size={backIconSize} color="#fff" weight="bold" />
        </TouchableOpacity>
      </View>

      {/* Center title */}
      <View className="flex-1 items-center">
        <Text className={titleClassName} numberOfLines={1}>
          {title}
        </Text>
      </View>

      {/* Right slot */}
      <View className="w-12 items-end">{right ?? null}</View>
    </View>
  );
}
