import { Stack } from 'expo-router';

export default function RoomsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="create" />
      <Stack.Screen name="join" />
      <Stack.Screen name="invite" />
    </Stack>
  );
}
