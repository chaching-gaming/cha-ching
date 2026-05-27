import { Text, TouchableOpacity, View } from 'react-native';
import { CheckSquare, Square } from 'phosphor-react-native';

import { getEffectiveBetStatus } from '@/lib/effective-bet-status';
import { colors } from '@/constants/colors';
import type { BetWithProfiles } from '@/hooks/use-activity-feed';

export type BetFilter = 'active' | 'open' | 'matched' | 'settled';

const OPTIONS: { key: BetFilter; label: string }[] = [
  { key: 'active', label: 'Active' },
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
    <View className="mb-3">
      {/* Status filters */}
      <View className="flex-row gap-2">
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

      {/* My Bets checkbox */}
      {onMyBetsChange ? (
        <TouchableOpacity
          onPress={() => onMyBetsChange(!myBetsOnly)}
          activeOpacity={0.7}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: myBetsOnly }}
          accessibilityLabel="Show only my bets"
          className="mt-3 flex-row items-center gap-2"
        >
          {myBetsOnly ? (
            <CheckSquare size={22} color={colors.primary} weight="fill" />
          ) : (
            <Square size={22} color={colors.textMuted} />
          )}
          <Text
            className={`text-sm font-medium ${myBetsOnly ? 'text-white' : 'text-text-secondary'}`}
          >
            Show only my bets
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function betMatchesFilter(bet: BetWithProfiles, filter: BetFilter): boolean {
  const effectiveStatus = getEffectiveBetStatus(bet);

  if (filter === 'active') {
    // All non-terminal bets: OPEN, MATCHED, PENDING_RESULT, DISPUTED
    return (
      effectiveStatus === 'OPEN' ||
      effectiveStatus === 'PENDING_RESULT' ||
      effectiveStatus === 'DISPUTED' ||
      bet.status === 'MATCHED'
    );
  }
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
