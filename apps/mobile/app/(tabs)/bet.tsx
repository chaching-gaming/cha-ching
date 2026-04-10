import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/screen-header';

export default function BetScreen() {
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Place a Bet" />
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-base text-text-secondary">Create a new prop bet</Text>
      </View>
    </View>
  );
}
