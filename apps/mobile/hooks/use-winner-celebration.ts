import { useEffect, useRef, useState } from 'react';

import type { ActivityItem, BetWithProfiles } from '@/hooks/use-activity-feed';
import { useFeedback } from '@/providers/feedback';

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
  // Only consider celebrated if the outcome matches
  return celebratedOutcome === outcome.trim().toLowerCase();
}

function didUserWin(bet: BetWithProfiles, userId: string | null): boolean {
  // Use preliminary_outcome for PENDING_DISPUTE, outcome for SETTLED
  const effectiveOutcome = bet.outcome ?? bet.preliminary_outcome;
  const outcomeKey = effectiveOutcome?.trim().toLowerCase() ?? '';
  if (!userId || !outcomeKey) return false;
  // Multi-player: current user wins if any of their stakes matched the outcome.
  return (bet.stakes ?? []).some(
    (s) => s.user_id === userId && s.pick.trim().toLowerCase() === outcomeKey,
  );
}

function didUserParticipate(bet: BetWithProfiles, userId: string | null): boolean {
  if (!userId) return false;
  return (bet.stakes ?? []).some((s) => s.user_id === userId);
}

/**
 * Detects live bet status transitions to celebration-worthy states. Fires:
 *   - Overlay + `bet_won` feedback when the current user won.
 *   - `bet_lost` feedback when the user participated but didn't win (no overlay).
 *
 * Celebration triggers on:
 *   - PENDING_DISPUTE: First outcome submission declares provisional winner
 *   - SETTLED: Final settlement (only if not already celebrated at PENDING_DISPUTE)
 *
 * On first data load we seed the "seen" set so we don't fire for historical
 * settlements. When paginating, we also seed new bets rather than celebrating
 * them. When multiple bets settle in the same tick, a win takes priority
 * over a loss for feedback (one sound per transition).
 */
export function useWinnerCelebration(
  items: ActivityItem[],
  currentUserId: string | null,
  isLoading: boolean,
  isFetchingNextPage: boolean = false,
) {
  const seenCelebrationWorthy = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const wasFetchingNextPage = useRef(false);
  const [celebratingBet, setCelebratingBet] = useState<BetWithProfiles | null>(null);
  const { trigger } = useFeedback();

  useEffect(() => {
    // Wait until the query has actually returned before seeding. Otherwise the empty
    // first-render `items` marks us initialized and every historical bet
    // arriving on the next render fires as a "new" transition.
    if (isLoading) return;

    // Log items count for debugging realtime updates
    if (__DEV__) console.log('[WinCelebration] Effect running, items count:', items.length, 'initialized:', initialized.current);

    // Detect if we just finished paginating (transition from fetching to not fetching).
    // When pagination completes, isFetchingNextPage becomes false and new items arrive
    // in the same render, so we need to track the previous state.
    const justFinishedPaginating = wasFetchingNextPage.current && !isFetchingNextPage;
    wasFetchingNextPage.current = isFetchingNextPage;

    // While actively fetching, do nothing - wait for data to arrive
    if (isFetchingNextPage) return;

    // Celebration-worthy statuses: PENDING_DISPUTE (first submission) or SETTLED
    const celebrationWorthyBets: BetWithProfiles[] = items
      .filter((it): it is Extract<ActivityItem, { type: 'bet' }> => it.type === 'bet')
      .map((it) => it.bet)
      .filter((b) => b.status === 'PENDING_DISPUTE' || b.status === 'SETTLED');

    // DEBUG: Log celebration-worthy bets
    if (__DEV__ && celebrationWorthyBets.length > 0) {
      console.log('[WinCelebration] celebrationWorthyBets:', celebrationWorthyBets.map(b => {
        const effectiveOutcome = b.outcome ?? b.preliminary_outcome ?? '';
        return {
          id: b.id,
          status: b.status,
          outcome: b.outcome,
          preliminary_outcome: b.preliminary_outcome,
          alreadySeen: seenCelebrationWorthy.current.has(`${b.id}:${effectiveOutcome}`),
          alreadyCelebrated: hasBetBeenCelebrated(b.id, effectiveOutcome),
        };
      }));
    }

    // On initial load OR after pagination completes, seed the set without celebrating.
    // We only want to celebrate real-time transitions, not historical ones.
    if (!initialized.current || justFinishedPaginating) {
      if (__DEV__) console.log('[WinCelebration] Seeding', celebrationWorthyBets.length, 'bets (init:', !initialized.current, 'paginated:', justFinishedPaginating, ')');
      for (const bet of celebrationWorthyBets) {
        const effectiveOutcome = bet.outcome ?? bet.preliminary_outcome ?? '';
        // Use bet ID + outcome as key to allow re-celebration if outcome changes
        seenCelebrationWorthy.current.add(`${bet.id}:${effectiveOutcome}`);
      }
      if (!initialized.current) initialized.current = true;
      return;
    }

    const newlyCelebrationWorthy: BetWithProfiles[] = [];
    for (const bet of celebrationWorthyBets) {
      const effectiveOutcome = bet.outcome ?? bet.preliminary_outcome ?? '';
      const seenKey = `${bet.id}:${effectiveOutcome}`;
      // Skip if already seen this bet+outcome in this session OR already celebrated globally for this outcome
      if (seenCelebrationWorthy.current.has(seenKey) || hasBetBeenCelebrated(bet.id, effectiveOutcome)) continue;
      seenCelebrationWorthy.current.add(seenKey);
      newlyCelebrationWorthy.push(bet);
    }

    if (__DEV__ && newlyCelebrationWorthy.length > 0) {
      console.log('[WinCelebration] New celebration-worthy bets:', newlyCelebrationWorthy.map(b => b.id));
    }

    if (newlyCelebrationWorthy.length === 0) return;

    // Win takes priority over loss; fall back to a loss if no win was found.
    let winBet: BetWithProfiles | null = null;
    let lossBet: BetWithProfiles | null = null;
    for (const bet of newlyCelebrationWorthy) {
      const won = didUserWin(bet, currentUserId);
      const participated = didUserParticipate(bet, currentUserId);
      if (__DEV__) console.log('[WinCelebration] Checking bet', bet.id, '- won:', won, 'participated:', participated);
      if (won) {
        winBet = bet;
        break;
      }
      if (!lossBet && participated) {
        lossBet = bet;
      }
    }

    if (winBet) {
      const winOutcome = winBet.outcome ?? winBet.preliminary_outcome ?? '';
      if (__DEV__) console.log('[WinCelebration] 🎉 Triggering WIN celebration for bet', winBet.id, 'outcome:', winOutcome);
      markBetCelebrated(winBet.id, winOutcome); // Mark globally with outcome to allow re-celebration if outcome changes
      setCelebratingBet(winBet);
      trigger('bet_won');
    } else if (lossBet) {
      const lossOutcome = lossBet.outcome ?? lossBet.preliminary_outcome ?? '';
      if (__DEV__) console.log('[WinCelebration] 😢 Triggering LOSS feedback for bet', lossBet.id, 'outcome:', lossOutcome);
      markBetCelebrated(lossBet.id, lossOutcome); // Mark globally with outcome to allow win celebration if dispute changes outcome
      trigger('bet_lost');
    }
  }, [items, currentUserId, isLoading, isFetchingNextPage, trigger]);

  const dismissCelebration = () => setCelebratingBet(null);

  return { celebratingBet, dismissCelebration };
}
