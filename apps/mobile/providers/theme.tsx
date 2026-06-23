import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';

import { lightColors, darkColors, type ThemeColors } from '@/constants/colors';

export type { ThemeColors };

const STORAGE_KEY = 'pref.theme';

export type ThemePreference = 'light' | 'dark';

type ThemeContextType = {
  /** User's preference: light or dark */
  themePreference: ThemePreference;
  /** Set the theme preference */
  setThemePreference: (preference: ThemePreference) => void;
  /** Whether the theme has been loaded from storage */
  isHydrated: boolean;
  /** Theme-aware colors for JS usage (icons, etc.) */
  colors: ThemeColors;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

const TRANSITION_DURATION = 200; // ms

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { setColorScheme } = useColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('light');
  const [isHydrated, setIsHydrated] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Theme-aware colors for JS usage (icons, RefreshControl, etc.)
  const colors = useMemo(
    () => (themePreference === 'dark' ? darkColors : lightColors),
    [themePreference],
  );

  // Load theme preference from storage on mount
  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (cancelled) return;
        // Migrate 'system' to 'light' for existing users
        if (value === 'light' || value === 'dark') {
          setThemePreferenceState(value);
        } else if (value === 'system') {
          setThemePreferenceState('light');
          void AsyncStorage.setItem(STORAGE_KEY, 'light');
        }
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Apply color scheme to NativeWind when theme preference changes after hydration
  useEffect(() => {
    if (isHydrated) {
      setColorScheme(themePreference);
    }
  }, [themePreference, isHydrated, setColorScheme]);

  const setThemePreference = useCallback((preference: ThemePreference) => {
    // Show transition overlay to hide staggered UI updates
    setIsTransitioning(true);
    setThemePreferenceState(preference);
    void AsyncStorage.setItem(STORAGE_KEY, preference);

    // Hide overlay after NativeWind has propagated changes
    setTimeout(() => {
      setIsTransitioning(false);
    }, TRANSITION_DURATION);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        themePreference,
        setThemePreference,
        isHydrated,
        colors,
      }}
    >
      {/* StatusBar style: 'dark' = dark icons (for light bg), 'light' = light icons (for dark bg) */}
      <StatusBar style={themePreference === 'dark' ? 'light' : 'dark'} />
      {children}
      {/* Theme transition overlay - hides staggered UI updates */}
      {isTransitioning && (
        <View style={[styles.overlay, { backgroundColor: colors.background }]} />
      )}
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
});

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
