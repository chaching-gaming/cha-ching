import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/screen-header';

export default function BetScreen() {
  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Place a Bet" />
      <View className="flex-1 items-center justify-center px-5">
        <Text className="text-center text-lg font-semibold text-white">Coming soon</Text>
        <Text className="mt-2 max-w-sm text-center text-base leading-6 text-text-secondary">
          Create a prop bet from an open room using the floating action on the room screen.
        </Text>
      </View>
    </View>
  );
}
