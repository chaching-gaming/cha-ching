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

/** Check if user won based on their stakes and the outcome */
function didUserWin(
  stakes: { user_id: string; pick: string }[] | undefined,
  userId: string | null,
  outcome: string,
): boolean {
  if (!userId || !outcome || !stakes) return false;
  const outcomeKey = outcome.trim().toLowerCase();
  return stakes.some((s) => s.user_id === userId && s.pick.trim().toLowerCase() === outcomeKey);
}

/** Check if user participated in the bet */
function didUserParticipate(
  stakes: { user_id: string }[] | undefined,
  userId: string | null,
): boolean {
  if (!userId || !stakes) return false;
  return stakes.some((s) => s.user_id === userId);
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
  const userIdRef = useRef(currentUserId);
  itemsRef.current = items;
  userIdRef.current = currentUserId;

  // Track which bet+outcome we've shown celebration for (local to this component)
  const shownCelebrationsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleCelebration = (event: CelebrationEvent) => {
      if (__DEV__) console.log('[WinCelebration] Received event:', event);

      // Use outcome from event (from notification) - this is the source of truth
      const effectiveOutcome = event.outcome ?? '';

      if (!effectiveOutcome) {
        if (__DEV__) console.log('[WinCelebration] No outcome in event:', event.betId);
        return;
      }

      // Check if we already showed this celebration locally (prevents duplicate on same page)
      const celebrationKey = `${event.betId}:${effectiveOutcome}`;
      if (shownCelebrationsRef.current.has(celebrationKey)) {
        if (__DEV__) console.log('[WinCelebration] Already shown locally:', celebrationKey);
        return;
      }

      // Find the bet in current items (for showing overlay with bet details)
      const betItem = itemsRef.current.find(
        (it) => it.type === 'bet' && it.bet?.id === event.betId,
      );
      const bet = betItem?.bet;

      // Determine win/loss
      let isWin: boolean;
      let isParticipant: boolean;

      if (event.type === 'pending_result') {
        // For pending_result, check user's stake against outcome
        if (!bet) {
          if (__DEV__)
            console.log('[WinCelebration] Bet not found for pending_result:', event.betId);
          return;
        }
        isWin = didUserWin(bet.stakes, userIdRef.current, effectiveOutcome);
        isParticipant = didUserParticipate(bet.stakes, userIdRef.current);
      } else {
        // For explicit win/loss events from server, trust the event type
        isWin = event.type === 'win';
        isParticipant = true;
      }

      if (!isParticipant) {
        if (__DEV__) console.log('[WinCelebration] User not a participant:', event.betId);
        return;
      }

      // Mark as shown locally
      shownCelebrationsRef.current.add(celebrationKey);
      // Also mark globally (for tracking outcome changes across sessions)
      markBetCelebrated(event.betId, effectiveOutcome);

      if (isWin) {
        if (__DEV__)
          console.log('[WinCelebration] 🎉 Showing WIN celebration for bet:', event.betId);
        if (bet) setCelebratingBet(bet);
        trigger('bet_won');
      } else {
        if (__DEV__) console.log('[WinCelebration] 😢 Playing LOSS sound for bet:', event.betId);
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
  const userIdRef = useRef(currentUserId);
  betRef.current = bet;
  userIdRef.current = currentUserId;

  // Track which bet+outcome we've shown celebration for (local to this component)
  const shownCelebrationsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleCelebration = (event: CelebrationEvent) => {
      if (__DEV__) console.log('[BetCelebration] Received event:', event);

      // Use outcome from event (from notification) - this is the source of truth
      const effectiveOutcome = event.outcome ?? '';

      if (!effectiveOutcome) {
        if (__DEV__) console.log('[BetCelebration] No outcome in event:', event.betId);
        return;
      }

      // Check if this event is for the current bet
      const currentBet = betRef.current;
      if (!currentBet || currentBet.id !== event.betId) {
        if (__DEV__)
          console.log(
            '[BetCelebration] Event not for current bet:',
            event.betId,
            'current:',
            currentBet?.id,
          );
        return;
      }

      // Check if we already showed this celebration locally (prevents duplicate on same page)
      const celebrationKey = `${event.betId}:${effectiveOutcome}`;
      if (shownCelebrationsRef.current.has(celebrationKey)) {
        if (__DEV__) console.log('[BetCelebration] Already shown locally:', celebrationKey);
        return;
      }

      // Determine win/loss
      let isWin: boolean;
      let isParticipant: boolean;

      if (event.type === 'pending_result') {
        // For pending_result, check user's stake against outcome
        isWin = didUserWin(currentBet.stakes, userIdRef.current, effectiveOutcome);
        isParticipant = didUserParticipate(currentBet.stakes, userIdRef.current);
      } else {
        // For explicit win/loss events from server, trust the event type
        isWin = event.type === 'win';
        isParticipant = true;
      }

      if (!isParticipant) {
        if (__DEV__) console.log('[BetCelebration] User not a participant:', currentBet.id);
        return;
      }

      // Mark as shown locally
      shownCelebrationsRef.current.add(celebrationKey);
      // Also mark globally (for tracking outcome changes across sessions)
      markBetCelebrated(event.betId, effectiveOutcome);

      if (isWin) {
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
