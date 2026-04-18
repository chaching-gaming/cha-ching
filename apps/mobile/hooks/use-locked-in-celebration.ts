import { useEffect, useRef, useState } from 'react';

import type { ActivityItem, BetWithProfiles } from '@/hooks/use-activity-feed';

/**
 * Fires a "You're locked in" flash the moment the current user's own stake
 * first appears in the feed — i.e. right after they successfully join a bet
 * via the accept-bet screen (or someone else joins on their behalf, which
 * shouldn't happen). Seeded on first load so already-joined bets don't
 * re-fire when the user navigates in.
 */
export function useLockedInCelebration(
  items: ActivityItem[],
  currentUserId: string | null,
  isLoading: boolean,
) {
  // Bet ids where we've already seen the current user staked.
  const seenJoined = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const [lockedInBet, setLockedInBet] = useState<BetWithProfiles | null>(null);

  useEffect(() => {
    if (isLoading || !currentUserId) return;

    const myJoinedBets: BetWithProfiles[] = items
      .filter((it): it is Extract<ActivityItem, { type: 'bet' }> => it.type === 'bet')
      .map((it) => it.bet)
      .filter((b) => (b.stakes ?? []).some((s) => s.user_id === currentUserId));

    if (!initialized.current) {
      for (const bet of myJoinedBets) seenJoined.current.add(bet.id);
      initialized.current = true;
      return;
    }

    for (const bet of myJoinedBets) {
      if (seenJoined.current.has(bet.id)) continue;
      seenJoined.current.add(bet.id);
      setLockedInBet(bet);
      return; // One at a time.
    }
  }, [items, currentUserId, isLoading]);

  const dismissLockedIn = () => setLockedInBet(null);

  return { lockedInBet, dismissLockedIn };
}
