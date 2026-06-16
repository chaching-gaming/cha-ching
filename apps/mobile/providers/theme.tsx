import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';
import { useColorScheme } from 'nativewind';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { lightColors, darkColors, type ThemeColors } from '@/constants/colors';

export type { ThemeColors };

const STORAGE_KEY = 'pref.theme';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

type ThemeContextType = {
  /** User's preference: light, dark, or system */
  themePreference: ThemePreference;
  /** Resolved theme after applying system preference */
  resolvedTheme: ResolvedTheme;
  /** Set the theme preference */
  setThemePreference: (preference: ThemePreference) => void;
  /** Whether the theme has been loaded from storage */
  isHydrated: boolean;
  /** Theme-aware colors for JS usage (icons, etc.) */
  colors: ThemeColors;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const { setColorScheme } = useColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('light');
  const [isHydrated, setIsHydrated] = useState(false);

  // Calculate resolved theme based on preference and system setting
  const resolvedTheme: ResolvedTheme =
    themePreference === 'system'
      ? systemColorScheme === 'dark'
        ? 'dark'
        : 'light'
      : themePreference;

  // Theme-aware colors for JS usage (icons, RefreshControl, etc.)
  const colors = useMemo(
    () => (resolvedTheme === 'dark' ? darkColors : lightColors),
    [resolvedTheme],
  );

  // Load theme preference from storage on mount
  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (cancelled) return;
        if (value === 'light' || value === 'dark' || value === 'system') {
          setThemePreferenceState(value);
        }
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Apply color scheme to NativeWind when resolved theme changes
  useEffect(() => {
    if (isHydrated) {
      setColorScheme(resolvedTheme);
    }
  }, [resolvedTheme, isHydrated, setColorScheme]);

  const setThemePreference = useCallback((preference: ThemePreference) => {
    setThemePreferenceState(preference);
    void AsyncStorage.setItem(STORAGE_KEY, preference);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        themePreference,
        resolvedTheme,
        setThemePreference,
        isHydrated,
        colors,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
