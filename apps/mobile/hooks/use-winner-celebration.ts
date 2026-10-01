import { useEffect, useRef, useState, useCallback } from 'react';

import type { BetWithProfiles } from '@/hooks/use-activity-feed';
import { useFeedback } from '@/providers/feedback';
import { subscribeToCelebrations, type CelebrationEvent } from '@/lib/celebration-events';

/**
 * Global map of bet IDs to the outcome that was celebrated/feedback-given.
 * Module-level to persist across component mounts/navigation.
 * This prevents showing the same celebration twice when navigating
 * between bet detail and room pages, BUT allows re-celebration if
 * the outcome changes (e.g., after dispute resolution).
 */
const globalCelebratedBets = new Map<string, string>();

/** Mark a bet as celebrated with a specific outcome */
export function markBetCelebrated(betId: string, outcome: string): void {
  globalCelebratedBets.set(betId, outcome.trim().toLowerCase());
}

/** Check if a bet has already been celebrated for the given outcome */
export function hasBetBeenCelebrated(betId: string, outcome: string): boolean {
  const celebratedOutcome = globalCelebratedBets.get(betId);
  if (!celebratedOutcome) return false;
  return celebratedOutcome === outcome.trim().toLowerCase();
}

/** Clear celebration tracking (useful for testing) */
export function clearCelebrationTracking(): void {
  globalCelebratedBets.clear();
}

/**
 * Hook for room-detail page to handle celebration events.
 * Listens for notification-triggered celebrations and finds the bet in activityItems.
 */
export function useWinnerCelebration(
  items: { type: string; bet?: BetWithProfiles }[],
  currentUserId: string | null,
  _isLoading: boolean = false,
  _isFetchingNextPage: boolean = false,
) {
  const [celebratingBet, setCelebratingBet] = useState<BetWithProfiles | null>(null);
  const { trigger } = useFeedback();
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const handleCelebration = (event: CelebrationEvent) => {
      if (__DEV__) console.log('[WinCelebration] Received event:', event);

      // Find the bet in current items
      const betItem = itemsRef.current.find(
        (it) => it.type === 'bet' && it.bet?.id === event.betId
      );
      const bet = betItem?.bet;

      if (!bet) {
        if (__DEV__) console.log('[WinCelebration] Bet not found in items:', event.betId);
        // Bet not in current view - still play feedback sound
        trigger(event.type === 'win' ? 'bet_won' : 'bet_lost');
        return;
      }

      const effectiveOutcome = bet.outcome ?? bet.preliminary_outcome ?? '';

      // Check if already celebrated for this outcome
      if (hasBetBeenCelebrated(bet.id, effectiveOutcome)) {
        if (__DEV__) console.log('[WinCelebration] Already celebrated:', bet.id, effectiveOutcome);
        return;
      }

      // Mark as celebrated
      markBetCelebrated(bet.id, effectiveOutcome);

      if (event.type === 'win') {
        if (__DEV__) console.log('[WinCelebration] 🎉 Showing WIN celebration for bet:', bet.id);
        setCelebratingBet(bet);
        trigger('bet_won');
      } else {
        if (__DEV__) console.log('[WinCelebration] 😢 Playing LOSS sound for bet:', bet.id);
        trigger('bet_lost');
      }
    };

    const unsubscribe = subscribeToCelebrations(handleCelebration);
    return unsubscribe;
  }, [trigger]);

  const dismissCelebration = useCallback(() => setCelebratingBet(null), []);

  return { celebratingBet, dismissCelebration };
}

/**
 * Hook for bet-detail page to handle celebration events for a specific bet.
 */
export function useBetCelebration(
  bet: BetWithProfiles | null | undefined,
  currentUserId: string | null,
) {
  const [showWinCelebration, setShowWinCelebration] = useState(false);
  const { trigger } = useFeedback();
  const betRef = useRef(bet);
  betRef.current = bet;

  useEffect(() => {
    const handleCelebration = (event: CelebrationEvent) => {
      const currentBet = betRef.current;
      if (!currentBet || currentBet.id !== event.betId) return;

      if (__DEV__) console.log('[BetCelebration] Received event for current bet:', event);

      const effectiveOutcome = currentBet.outcome ?? currentBet.preliminary_outcome ?? '';

      // Check if already celebrated for this outcome
      if (hasBetBeenCelebrated(currentBet.id, effectiveOutcome)) {
        if (__DEV__) console.log('[BetCelebration] Already celebrated:', currentBet.id);
        return;
      }

      // Mark as celebrated
      markBetCelebrated(currentBet.id, effectiveOutcome);

      if (event.type === 'win') {
        if (__DEV__) console.log('[BetCelebration] 🎉 Showing WIN celebration');
        setShowWinCelebration(true);
        trigger('bet_won');
      } else {
        if (__DEV__) console.log('[BetCelebration] 😢 Playing LOSS sound');
        trigger('bet_lost');
      }
    };

    const unsubscribe = subscribeToCelebrations(handleCelebration);
    return unsubscribe;
  }, [trigger]);

  const dismissWinCelebration = useCallback(() => setShowWinCelebration(false), []);

  return { showWinCelebration, dismissWinCelebration };
}
