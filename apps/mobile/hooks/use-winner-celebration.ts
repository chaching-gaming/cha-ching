import { useEffect, useRef, useState } from 'react';

import type { ActivityItem, BetWithProfiles } from '@/hooks/use-activity-feed';

/**
 * Detects live bet.status → SETTLED transitions in the activity feed and, if the current user
 * is the winner, queues a celebration. On first data load we seed the "seen" set so we don't
 * fire for historical settlements.
 */
export function useWinnerCelebration(
  items: ActivityItem[],
  currentUserId: string | null,
  isLoading: boolean,
) {
  const seenSettled = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const [celebratingBet, setCelebratingBet] = useState<BetWithProfiles | null>(null);

  useEffect(() => {
    // Wait until the query has actually returned before seeding. Otherwise the empty
    // first-render `items` marks us initialized and every historical SETTLED bet
    // arriving on the next render fires as a "new" transition.
    if (isLoading) return;

    const settledBets: BetWithProfiles[] = items
      .filter((it): it is Extract<ActivityItem, { type: 'bet' }> => it.type === 'bet')
      .map((it) => it.bet)
      .filter((b) => b.status === 'SETTLED');

    if (!initialized.current) {
      for (const bet of settledBets) seenSettled.current.add(bet.id);
      initialized.current = true;
      return;
    }

    for (const bet of settledBets) {
      if (seenSettled.current.has(bet.id)) continue;
      seenSettled.current.add(bet.id);
      if (bet.winner && bet.winner === currentUserId) {
        setCelebratingBet(bet);
        return; // Celebrate one at a time; rest sit queued in the seen set.
      }
    }
  }, [items, currentUserId, isLoading]);

  const dismissCelebration = () => setCelebratingBet(null);

  return { celebratingBet, dismissCelebration };
}
