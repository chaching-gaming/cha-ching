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
}

export function BetFeedStatusFilter({ value, onChange }: BetFeedStatusFilterProps) {
  return (
    <View className="mb-3 flex-row gap-2">
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
  );
}

export function betMatchesFilter(bet: BetWithProfiles, filter: BetFilter): boolean {
  if (filter === 'all') return true;
  const dbStatus = bet.status;
  if (filter === 'open') return getEffectiveBetStatus(bet) === 'OPEN';
  if (filter === 'matched') {
    return dbStatus === 'MATCHED' || dbStatus === 'PENDING_RESULT' || dbStatus === 'DISPUTED';
  }
  // 'settled' — all final states plus db-OPEN-but-effectively-EXPIRED
  return (
    dbStatus === 'SETTLED' ||
    dbStatus === 'VOID' ||
    dbStatus === 'EXPIRED' ||
    getEffectiveBetStatus(bet) === 'EXPIRED'
  );
}
