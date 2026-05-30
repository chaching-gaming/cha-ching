import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { Audio, AVPlaybackSource } from 'expo-av';

import { usePreferences } from '@/providers/preferences';

export type FeedbackEvent =
  | 'bet_accepted'
  | 'bet_matched'
  | 'bet_won'
  | 'bet_lost'
  | 'chip_donated'
  | 'chip_received'
  | 'alert';

// Sound sources - audio files in @/assets/audio/ folder
// See assets/audio/README.md for file specifications
const SOUND_SOURCES: Record<FeedbackEvent, AVPlaybackSource | null> = {
  bet_accepted: require('@/assets/audio/tick.mp3'),
  bet_matched: require('@/assets/audio/jingle.mp3'),
  bet_won: require('@/assets/audio/chaching.mp3'),
  bet_lost: require('@/assets/audio/deflation.mp3'),
  chip_donated: require('@/assets/audio/coin.mp3'),
  chip_received: require('@/assets/audio/coin.mp3'),
  alert: null, // Uses haptics only - device default for push notifications
};

type FeedbackContextType = {
  trigger: (event: FeedbackEvent) => void;
};

const FeedbackContext = createContext<FeedbackContextType | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const { hapticsEnabled, soundEnabled, isHydrated } = usePreferences();
  const soundsRef = useRef<Map<FeedbackEvent, Audio.Sound>>(new Map());
  const loadingRef = useRef(false);

  // Load sound files on mount
  useEffect(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    const loadSounds = async () => {
      // Configure audio mode for playback
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: false,
          staysActiveInBackground: false,
        });
      } catch {
        // Audio mode configuration failed - sounds may not play correctly
      }

      // Load each sound file
      for (const [event, source] of Object.entries(SOUND_SOURCES)) {
        if (!source) continue;
        try {
          const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: false });
          soundsRef.current.set(event as FeedbackEvent, sound);
        } catch {
          // Sound loading failed - this feedback event will be silent
        }
      }
    };

    void loadSounds();

    // Cleanup on unmount
    return () => {
      for (const sound of soundsRef.current.values()) {
        void sound.unloadAsync();
      }
      soundsRef.current.clear();
    };
  }, []);

  const playSound = useCallback(async (event: FeedbackEvent) => {
    const sound = soundsRef.current.get(event);
    if (!sound) return;

    try {
      // Reset to beginning and play
      await sound.setPositionAsync(0);
      await sound.playAsync();
    } catch {
      // Sound playback failed
    }
  }, []);

  const triggerHaptic = useCallback((event: FeedbackEvent) => {
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
      case 'chip_donated':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'chip_received':
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'alert':
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
    }
  }, []);

  const trigger = useCallback(
    (event: FeedbackEvent) => {
      if (!isHydrated) return;

      // Trigger haptic feedback
      if (hapticsEnabled) {
        triggerHaptic(event);
      }

      // Trigger sound feedback
      if (soundEnabled) {
        void playSound(event);
      }
    },
    [isHydrated, hapticsEnabled, soundEnabled, triggerHaptic, playSound],
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
