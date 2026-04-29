import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

const STORAGE_KEY_SOUND = 'pref.sound';
const STORAGE_KEY_HAPTICS = 'pref.haptics';
const STORAGE_KEY_NOTIFICATIONS = 'pref.notifications';

type PreferencesContextType = {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  notificationsEnabled: boolean;
  setSoundEnabled: (value: boolean) => void;
  setHapticsEnabled: (value: boolean) => void;
  setNotificationsEnabled: (value: boolean) => void;
  /**
   * `false` until AsyncStorage has been read. Consumers that fire feedback
   * should no-op during this window so stored `false` values don't play before
   * they're hydrated.
   */
  isHydrated: boolean;
};

const PreferencesContext = createContext<PreferencesContextType | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [hapticsEnabled, setHapticsEnabledState] = useState(true);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.multiGet([STORAGE_KEY_SOUND, STORAGE_KEY_HAPTICS, STORAGE_KEY_NOTIFICATIONS])
      .then((pairs) => {
        if (cancelled) return;
        for (const [key, value] of pairs) {
          if (value === null) continue;
          const bool = value === 'true';
          if (key === STORAGE_KEY_SOUND) setSoundEnabledState(bool);
          else if (key === STORAGE_KEY_HAPTICS) setHapticsEnabledState(bool);
          else if (key === STORAGE_KEY_NOTIFICATIONS) setNotificationsEnabledState(bool);
        }
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSoundEnabled = useCallback((value: boolean) => {
    setSoundEnabledState(value);
    void AsyncStorage.setItem(STORAGE_KEY_SOUND, String(value));
  }, []);

  const setHapticsEnabled = useCallback((value: boolean) => {
    setHapticsEnabledState(value);
    void AsyncStorage.setItem(STORAGE_KEY_HAPTICS, String(value));
  }, []);

  const setNotificationsEnabled = useCallback((value: boolean) => {
    setNotificationsEnabledState(value);
    void AsyncStorage.setItem(STORAGE_KEY_NOTIFICATIONS, String(value));
    // Sync with server
    void supabase.rpc('update_notification_preference', { p_enabled: value });
  }, []);

  return (
    <PreferencesContext.Provider
      value={{
        soundEnabled,
        hapticsEnabled,
        notificationsEnabled,
        setSoundEnabled,
        setHapticsEnabled,
        setNotificationsEnabled,
        isHydrated,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}
