import { useEffect, useRef, useState } from 'react';

import type { ActivityItem, BetWithProfiles } from '@/hooks/use-activity-feed';
import { useFeedback } from '@/providers/feedback';

/**
 * Global set of bet IDs that have been celebrated.
 * Module-level to persist across component mounts/navigation.
 * This prevents showing the same celebration twice when navigating
 * between bet detail and room pages.
 */
const globalCelebratedBets = new Set<string>();

/** Mark a bet as celebrated (called from any page that shows celebration) */
export function markBetCelebrated(betId: string): void {
  globalCelebratedBets.add(betId);
}

/** Check if a bet has already been celebrated */
export function hasBetBeenCelebrated(betId: string): boolean {
  return globalCelebratedBets.has(betId);
}

function didUserWin(bet: BetWithProfiles, userId: string | null): boolean {
  const outcomeKey = bet.outcome?.trim().toLowerCase() ?? '';
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
 * Detects live bet.status → SETTLED transitions in the activity feed. Fires:
 *   - Overlay + `bet_won` feedback when the current user won.
 *   - `bet_lost` feedback when the user participated but didn't win (no overlay).
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
  const seenSettled = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const wasFetchingNextPage = useRef(false);
  const [celebratingBet, setCelebratingBet] = useState<BetWithProfiles | null>(null);
  const { trigger } = useFeedback();

  useEffect(() => {
    // Wait until the query has actually returned before seeding. Otherwise the empty
    // first-render `items` marks us initialized and every historical SETTLED bet
    // arriving on the next render fires as a "new" transition.
    if (isLoading) return;

    // Detect if we just finished paginating (transition from fetching to not fetching).
    // When pagination completes, isFetchingNextPage becomes false and new items arrive
    // in the same render, so we need to track the previous state.
    const justFinishedPaginating = wasFetchingNextPage.current && !isFetchingNextPage;
    wasFetchingNextPage.current = isFetchingNextPage;

    // While actively fetching, do nothing - wait for data to arrive
    if (isFetchingNextPage) return;

    const settledBets: BetWithProfiles[] = items
      .filter((it): it is Extract<ActivityItem, { type: 'bet' }> => it.type === 'bet')
      .map((it) => it.bet)
      .filter((b) => b.status === 'SETTLED');

    // On initial load OR after pagination completes, seed the set without celebrating.
    // We only want to celebrate real-time settlements, not historical ones.
    if (!initialized.current || justFinishedPaginating) {
      for (const bet of settledBets) seenSettled.current.add(bet.id);
      if (!initialized.current) initialized.current = true;
      return;
    }

    const newlySettled: BetWithProfiles[] = [];
    for (const bet of settledBets) {
      // Skip if already seen in this session OR already celebrated globally
      if (seenSettled.current.has(bet.id) || globalCelebratedBets.has(bet.id)) continue;
      seenSettled.current.add(bet.id);
      newlySettled.push(bet);
    }
    if (newlySettled.length === 0) return;

    // Win takes priority over loss; fall back to a loss if no win was found.
    let winBet: BetWithProfiles | null = null;
    let lossBet: BetWithProfiles | null = null;
    for (const bet of newlySettled) {
      if (didUserWin(bet, currentUserId)) {
        winBet = bet;
        break;
      }
      if (!lossBet && didUserParticipate(bet, currentUserId)) {
        lossBet = bet;
      }
    }

    if (winBet) {
      globalCelebratedBets.add(winBet.id); // Mark globally to prevent duplicate celebrations
      setCelebratingBet(winBet);
      trigger('bet_won');
    } else if (lossBet) {
      globalCelebratedBets.add(lossBet.id); // Mark globally even for losses
      trigger('bet_lost');
    }
  }, [items, currentUserId, isLoading, isFetchingNextPage, trigger]);

  const dismissCelebration = () => setCelebratingBet(null);

  return { celebratingBet, dismissCelebration };
}
