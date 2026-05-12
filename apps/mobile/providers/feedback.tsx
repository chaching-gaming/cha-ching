import { createContext, useCallback, useContext } from 'react';
import * as Haptics from 'expo-haptics';

import { usePreferences } from '@/providers/preferences';

export type FeedbackEvent =
  | 'bet_accepted'
  | 'bet_matched'
  | 'bet_won'
  | 'bet_lost'
  | 'alert';

// NOTE: Custom notification sounds are planned for a future phase.
// Push notifications use the device's default notification sound.
// In-app feedback currently uses haptics only.

type FeedbackContextType = {
  trigger: (event: FeedbackEvent) => void;
};

const FeedbackContext = createContext<FeedbackContextType | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const { hapticsEnabled, isHydrated } = usePreferences();

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
    },
    [isHydrated, hapticsEnabled],
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
