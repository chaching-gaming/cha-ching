import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/screen-header';

export default function StatsScreen() {
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Stats" />
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-base text-text-secondary">Your betting stats</Text>
      </View>
    </View>
  );
}
