import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/screen-header';

export default function FeedScreen() {
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Feed" />
      <View className="flex-1 items-center justify-center px-5">
        <Text className="text-center text-lg font-semibold text-white">Coming soon</Text>
        <Text className="mt-2 max-w-sm text-center text-base leading-6 text-text-secondary">
          Latest room activity will show here once the feed is wired up.
        </Text>
      </View>
    </View>
  );
}
