import { useEffect, useRef, useState } from 'react';

import type { ActivityItem, BetWithProfiles } from '@/hooks/use-activity-feed';

/**
 * Detects live bet transitions into a matched state and queues a "You're locked in"
 * celebration for the current user if they're a participant. Seeded on first load so
 * historical MATCHED / PENDING_RESULT / DISPUTED / SETTLED bets don't fire.
 */
export function useLockedInCelebration(items: ActivityItem[], currentUserId: string | null) {
  const seenMatched = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const [lockedInBet, setLockedInBet] = useState<BetWithProfiles | null>(null);

  useEffect(() => {
    const lockedBets: BetWithProfiles[] = items
      .filter((it): it is Extract<ActivityItem, { type: 'bet' }> => it.type === 'bet')
      .map((it) => it.bet)
      .filter(
        (b) =>
          b.status === 'MATCHED' ||
          b.status === 'PENDING_RESULT' ||
          b.status === 'DISPUTED' ||
          b.status === 'SETTLED',
      );

    if (!initialized.current) {
      for (const bet of lockedBets) seenMatched.current.add(bet.id);
      initialized.current = true;
      return;
    }

    for (const bet of lockedBets) {
      if (seenMatched.current.has(bet.id)) continue;
      seenMatched.current.add(bet.id);
      const isParticipant =
        !!currentUserId && (bet.offered_by === currentUserId || bet.accepted_by === currentUserId);
      if (isParticipant) {
        setLockedInBet(bet);
        return; // One at a time.
      }
    }
  }, [items, currentUserId]);

  const dismissLockedIn = () => setLockedInBet(null);

  return { lockedInBet, dismissLockedIn };
}
