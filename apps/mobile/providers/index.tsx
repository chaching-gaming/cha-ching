import { useMemo } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { queryClient } from '@/lib/query-client';
import { AuthProvider } from './auth';
import { FeedbackProvider } from './feedback';
import { NotificationProvider } from './notifications';
import { PreferencesProvider } from './preferences';
import { ThemeProvider, useTheme } from './theme';
import { TimeProvider } from './time';
import { ToastProvider } from './toast';

/** Wrapper that provides React Navigation theme based on our theme context */
function NavigationTheme({ children }: { children: React.ReactNode }) {
  const { colors, themePreference } = useTheme();

  const navigationTheme = useMemo(
    () => ({
      ...DefaultTheme,
      dark: themePreference === 'dark',
      colors: {
        ...DefaultTheme.colors,
        background: colors.background,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.border,
        primary: colors.primary,
      },
    }),
    [colors, themePreference]
  );

  return <NavigationThemeProvider value={navigationTheme}>{children}</NavigationThemeProvider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <NavigationTheme>
          <TimeProvider>
            <AuthProvider>
              <PreferencesProvider>
                <ToastProvider>
                  <NotificationProvider>
                    <FeedbackProvider>{children}</FeedbackProvider>
                  </NotificationProvider>
                </ToastProvider>
              </PreferencesProvider>
            </AuthProvider>
          </TimeProvider>
        </NavigationTheme>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
