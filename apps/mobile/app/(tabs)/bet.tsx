import { Text, View } from 'react-native';

export default function BetScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text className="text-2xl font-bold text-white">Place a Bet</Text>
      <Text className="mt-2 text-base text-text-secondary">Create a new prop bet</Text>
    </View>
  );
}
