import 'react-native-gesture-handler';
import '../global.css';

import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

import { Providers } from '@/providers';
import { useAuth } from '@/providers/auth';
import { LoadingScreen } from '@/components/ui';
import * as Sentry from '@sentry/react-native';
import { env } from '@/lib/env';

Sentry.init({
  dsn: env.sentryDsn,
  environment: env.environment,
  // enabled: env.environment !== 'development',
  tracesSampleRate: 0.2,
  attachScreenshot: true,
  attachViewHierarchy: true,

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],
});

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

void SplashScreen.preventAutoHideAsync().catch(() => {
  /* Dev / fast refresh: splash may already be hidden or not registered */
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, isLoading, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const currentScreen = segments[1] as string | undefined;
    const onResetPassword =
      currentScreen === 'reset-password' || currentScreen === 'forgot-password';

    // Handle password recovery flow - redirect to reset password screen
    if (isPasswordRecovery && currentScreen !== 'reset-password') {
      router.replace('/(auth)/reset-password' as Href);
      return;
    }

    // Allow reset-password screen during password recovery
    if (isPasswordRecovery && onResetPassword) {
      return;
    }

    // Clear password recovery flag when leaving reset-password screen
    if (!onResetPassword && !isPasswordRecovery) {
      clearPasswordRecovery();
    }

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)/rooms');
    }
  }, [session, isLoading, isPasswordRecovery, segments, router, clearPasswordRecovery]);

  // Show loading screen while checking auth state
  if (isLoading) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}

export default Sentry.wrap(function RootLayout() {
  const [loaded, fontError] = useFonts({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (loaded || fontError) {
      void SplashScreen.hideAsync().catch(() => {
        /* Dev / fast refresh: no native splash registered for this VC */
      });
    }
  }, [loaded, fontError]);

  if (!loaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Providers>
        <BottomSheetModalProvider>
          <AuthGate>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(auth)" />
            </Stack>
          </AuthGate>
        </BottomSheetModalProvider>
      </Providers>
    </GestureHandlerRootView>
  );
});
