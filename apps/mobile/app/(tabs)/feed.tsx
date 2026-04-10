import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/screen-header';

export default function FeedScreen() {
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Feed" />
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-base text-text-secondary">Latest activity</Text>
      </View>
    </View>
  );
}
