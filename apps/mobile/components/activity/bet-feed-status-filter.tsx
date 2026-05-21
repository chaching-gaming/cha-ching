import { Text, TouchableOpacity, View } from 'react-native';

import { getEffectiveBetStatus } from '@/lib/effective-bet-status';
import type { BetWithProfiles } from '@/hooks/use-activity-feed';

export type BetFilter = 'all' | 'open' | 'matched' | 'settled';

const OPTIONS: { key: BetFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'matched', label: 'Matched' },
  { key: 'settled', label: 'Settled' },
];

interface BetFeedStatusFilterProps {
  value: BetFilter;
  onChange: (v: BetFilter) => void;
  myBetsOnly?: boolean;
  onMyBetsChange?: (v: boolean) => void;
}

export function BetFeedStatusFilter({
  value,
  onChange,
  myBetsOnly = false,
  onMyBetsChange,
}: BetFeedStatusFilterProps) {
  return (
    <View className="mb-3 flex-row items-center">
      {/* Status filters */}
      <View className="flex-1 flex-row gap-2">
        {OPTIONS.map((o) => {
          const active = o.key === value;
          return (
            <TouchableOpacity
              key={o.key}
              onPress={() => onChange(o.key)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className={`flex-1 items-center justify-center rounded-xl py-2.5 ${
                active ? 'bg-primary' : 'border border-border bg-surface-light'
              }`}
            >
              <Text className={`text-sm font-bold ${active ? 'text-white' : 'text-text-secondary'}`}>
                {o.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* My Bets toggle - separated */}
      {onMyBetsChange ? (
        <TouchableOpacity
          onPress={() => onMyBetsChange(!myBetsOnly)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ selected: myBetsOnly }}
          accessibilityLabel="Show only my bets"
          className={`ml-3 items-center justify-center rounded-xl px-3 py-2.5 ${
            myBetsOnly ? 'bg-primary' : 'border border-border bg-surface-light'
          }`}
        >
          <Text
            className={`text-sm font-bold ${myBetsOnly ? 'text-white' : 'text-text-secondary'}`}
          >
            Me
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function betMatchesFilter(bet: BetWithProfiles, filter: BetFilter): boolean {
  if (filter === 'all') return true;
  const effectiveStatus = getEffectiveBetStatus(bet);
  if (filter === 'open') return effectiveStatus === 'OPEN';
  if (filter === 'matched') {
    // Includes bets that are matched/pending/disputed in DB,
    // or OPEN in DB but effectively PENDING_RESULT (matched + expired)
    return (
      effectiveStatus === 'PENDING_RESULT' ||
      effectiveStatus === 'DISPUTED' ||
      bet.status === 'MATCHED'
    );
  }
  // 'settled' — all final states plus unmatched expired bets
  return (
    bet.status === 'SETTLED' ||
    bet.status === 'VOID' ||
    bet.status === 'EXPIRED' ||
    effectiveStatus === 'EXPIRED'
  );
}

/** Check if the current user is involved in a bet (has a stake) */
export function betInvolvesUser(bet: BetWithProfiles, userId: string | null): boolean {
  if (!userId) return false;
  return (bet.stakes ?? []).some((s) => s.user_id === userId);
}
