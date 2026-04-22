import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import {
  setAudioModeAsync,
  useAudioPlayer,
  type AudioPlayer,
  type AudioSource,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';

import { usePreferences } from '@/providers/preferences';

export type FeedbackEvent =
  | 'bet_accepted'
  | 'bet_matched'
  | 'bet_won'
  | 'bet_lost'
  | 'alert';

// Audio assets are loaded per event. Drop MP3 files into apps/mobile/assets/audio/
// (see README.md there) and swap `null` to `require('@/assets/audio/<file>')`.
// Nulls are supported by expo-audio — the player exists but `play()` is a no-op.
const SOUND_SOURCES: Record<FeedbackEvent, AudioSource> = {
  bet_accepted: null, // require('@/assets/audio/tick.mp3')
  bet_matched: null, // require('@/assets/audio/jingle.mp3')
  bet_won: null, // require('@/assets/audio/chaching.mp3')
  bet_lost: null, // require('@/assets/audio/deflation.mp3')
  alert: null, // require('@/assets/audio/alerts.mp3')
};

type FeedbackContextType = {
  trigger: (event: FeedbackEvent) => void;
};

const FeedbackContext = createContext<FeedbackContextType | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const { soundEnabled, hapticsEnabled, isHydrated } = usePreferences();

  // One preloaded player per event. Static require() paths keep Metro happy.
  const tickPlayer = useAudioPlayer(SOUND_SOURCES.bet_accepted);
  const jinglePlayer = useAudioPlayer(SOUND_SOURCES.bet_matched);
  const chachingPlayer = useAudioPlayer(SOUND_SOURCES.bet_won);
  const deflationPlayer = useAudioPlayer(SOUND_SOURCES.bet_lost);
  const alertsPlayer = useAudioPlayer(SOUND_SOURCES.alert);

  const players = useMemo<Record<FeedbackEvent, AudioPlayer>>(
    () => ({
      bet_accepted: tickPlayer,
      bet_matched: jinglePlayer,
      bet_won: chachingPlayer,
      bet_lost: deflationPlayer,
      alert: alertsPlayer,
    }),
    [tickPlayer, jinglePlayer, chachingPlayer, deflationPlayer, alertsPlayer],
  );

  useEffect(() => {
    // Respect the iOS silent switch — feedback SFX shouldn't override it.
    void setAudioModeAsync({ playsInSilentMode: false }).catch(() => {
      /* best-effort; non-fatal on Android/web */
    });
  }, []);

  const trigger = useCallback(
    (event: FeedbackEvent) => {
      if (!isHydrated) return;

      if (hapticsEnabled) {
        switch (event) {
          case 'bet_accepted':
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            break;
          case 'bet_matched':
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            break;
          case 'bet_won':
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            break;
          case 'bet_lost':
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            break;
          case 'alert':
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            break;
        }
      }

      if (soundEnabled && SOUND_SOURCES[event] !== null) {
        const player = players[event];
        // seekTo returns a promise; fire-and-forget so play() starts immediately
        // on the next tick. seeking to 0 lets rapid re-triggers interrupt a
        // still-playing sound cleanly.
        void player.seekTo(0);
        player.play();
      }
    },
    [isHydrated, hapticsEnabled, soundEnabled, players],
  );

  return <FeedbackContext.Provider value={{ trigger }}>{children}</FeedbackContext.Provider>;
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return context;
}
