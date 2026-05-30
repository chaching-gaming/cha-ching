import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

const OFFSET_STORAGE_KEY = '@cha-ching/server-time-offset';
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface TimeContextValue {
  /** Get the current server time (adjusted for offset) */
  getServerTime: () => Date;
  /** Current offset in milliseconds (server - client). Positive = server ahead. */
  offset: number;
  /** Whether the initial sync has completed */
  synced: boolean;
}

const TimeContext = createContext<TimeContextValue | null>(null);

/**
 * Syncs with server time and provides adjusted timestamps.
 * Uses NTP-style round-trip calculation to account for network latency.
 */
export function TimeProvider({ children }: { children: React.ReactNode }) {
  const [offset, setOffset] = useState(0);
  const [synced, setSynced] = useState(false);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  /**
   * NTP-style offset calculation:
   * T1 = client time before request
   * Ts = server time returned
   * T2 = client time after response
   * offset = Ts - (T1 + T2) / 2
   */
  const syncTime = useCallback(async () => {
    try {
      const t1 = Date.now();
      // Cast to any to support new RPC before types are regenerated
      const { data, error } = await (supabase.rpc as any)('get_server_time');
      const t2 = Date.now();

      if (error || !data) {
        console.warn('[TimeProvider] Failed to sync server time:', error?.message);
        return;
      }

      const serverTime = new Date(data).getTime();
      const clientMidpoint = (t1 + t2) / 2;
      const newOffset = serverTime - clientMidpoint;

      if (!mountedRef.current) return;

      setOffset(newOffset);
      setSynced(true);

      // Persist offset for quick recovery on next launch
      await AsyncStorage.setItem(OFFSET_STORAGE_KEY, String(newOffset));
    } catch (err) {
      console.warn('[TimeProvider] Error syncing time:', err);
    }
  }, []);

  // Load persisted offset on mount, then sync fresh
  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(OFFSET_STORAGE_KEY);
        if (stored != null && mountedRef.current) {
          setOffset(Number(stored));
          setSynced(true); // Use cached offset immediately
        }
      } catch {
        // Ignore storage errors
      }

      // Always sync fresh on mount
      await syncTime();
    })();

    return () => {
      mountedRef.current = false;
    };
  }, [syncTime]);

  // Re-sync every 5 minutes
  useEffect(() => {
    const scheduleSync = () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        void syncTime();
        scheduleSync();
      }, SYNC_INTERVAL_MS);
    };

    scheduleSync();

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [syncTime]);

  // Re-sync when app comes to foreground
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void syncTime();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [syncTime]);

  const getServerTime = useCallback(() => {
    return new Date(Date.now() + offset);
  }, [offset]);

  const value = useMemo(
    () => ({ getServerTime, offset, synced }),
    [getServerTime, offset, synced],
  );

  return <TimeContext.Provider value={value}>{children}</TimeContext.Provider>;
}

/**
 * Hook to access server time utilities.
 * Returns getServerTime() function and sync status.
 */
export function useServerTime() {
  const context = useContext(TimeContext);
  if (!context) {
    throw new Error('useServerTime must be used within a TimeProvider');
  }
  return context;
}

/**
 * Hook that returns the current server time and updates every second.
 * Use this in countdown components to get a ticking Date object.
 */
export function useServerTimeTick(): Date {
  const { getServerTime, offset } = useServerTime();
  const [now, setNow] = useState(() => getServerTime());

  useEffect(() => {
    // Update immediately when offset changes
    setNow(new Date(Date.now() + offset));

    const interval = setInterval(() => {
      setNow(new Date(Date.now() + offset));
    }, 1000);

    return () => clearInterval(interval);
  }, [offset]);

  return now;
}
