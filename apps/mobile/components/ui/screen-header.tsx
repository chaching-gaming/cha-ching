import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretLeft } from 'phosphor-react-native';

interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
  right?: React.ReactNode;
}

export function ScreenHeader({ title, showBack = false, right }: ScreenHeaderProps) {
  const router = useRouter();

  return (
    <View className="flex-row items-center justify-between bg-background px-5 pb-3 pt-16">
      <View className="flex-row items-center gap-2">
        {showBack ? (
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} className="-ml-1">
            <CaretLeft size={24} color="#fff" weight="bold" />
          </TouchableOpacity>
        ) : null}
        <Text className="text-2xl font-bold text-white">{title}</Text>
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}
