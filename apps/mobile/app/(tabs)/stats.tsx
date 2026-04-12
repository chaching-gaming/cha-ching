import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/screen-header';

export default function StatsScreen() {
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Stats" />
      <View className="flex-1 items-center justify-center px-5">
        <Text className="text-center text-lg font-semibold text-white">Coming soon</Text>
        <Text className="mt-2 max-w-sm text-center text-base leading-6 text-text-secondary">
          Your betting stats and trends will appear here.
        </Text>
      </View>
    </View>
  );
}
