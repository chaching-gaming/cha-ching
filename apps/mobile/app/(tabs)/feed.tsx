import { Text, View } from 'react-native';

export default function FeedScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text className="text-2xl font-bold text-white">Feed</Text>
      <Text className="mt-2 text-base text-text-secondary">Latest activity</Text>
    </View>
  );
}
