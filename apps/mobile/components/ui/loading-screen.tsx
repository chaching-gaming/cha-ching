import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Image, Text, View } from 'react-native';

import { colors } from '@/constants/colors';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message }: LoadingScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
          alignItems: 'center',
        }}
      >
        <Image
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require('../../assets/images/icon.png')}
          className="mb-6 h-28 w-28"
          resizeMode="contain"
        />
        <Text className="mb-6 text-3xl font-bold text-text-primary">Cha-Ching</Text>
        <ActivityIndicator size="large" color={colors.primary} />
        {message && (
          <Text className="mt-4 text-sm text-text-secondary">{message}</Text>
        )}
      </Animated.View>
    </View>
  );
}
