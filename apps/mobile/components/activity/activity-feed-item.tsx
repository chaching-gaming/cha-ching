import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { ArrowRight, Check, Coins, Timer, Warning } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { SwipeToAcceptRow } from '@/components/activity/swipe-to-accept-row';
import type { ActivityItem, BetWithProfiles } from '@/hooks/use-activity-feed';
import { formatBetCountdown, formatRelativeActivityTime } from '@/lib/date-format';
import { getEffectiveBetStatus } from '@/lib/effective-bet-status';

function formatStakeChips(stake: number): string {
  return `${stake.toLocaleString('en-US')} chips`;
}

function getBetStatusPill(status: string | null | undefined): {
  label: string;
  variant: 'success' | 'matched' | 'attestor' | 'default' | 'error';
} {
  switch (status) {
    case 'OPEN':
      return { label: 'OPEN', variant: 'success' };
    case 'MATCHED':
      return { label: 'MATCHED', variant: 'matched' };
    case 'PENDING_RESULT':
      return { label: 'PENDING', variant: 'attestor' };
    case 'SETTLED':
      return { label: 'SETTLED', variant: 'default' };
    case 'EXPIRED':
      return { label: 'EXPIRED', variant: 'default' };
    case 'VOID':
      return { label: 'VOID', variant: 'default' };
    case 'DISPUTED':
      return { label: 'DISPUTED', variant: 'error' };
    default:
      return { label: (status ?? 'UNKNOWN').toUpperCase(), variant: 'default' };
  }
}

function BetActivityCard({
  bet,
  timestamp,
  showAcceptHint,
}: {
  bet: BetWithProfiles;
  timestamp: string;
  showAcceptHint?: boolean;
}) {
  const [tick, setTick] = useState(0);
  const dbStatus = bet.status ?? '';

  useEffect(() => {
    if (dbStatus !== 'OPEN' || !bet.expires_at) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [dbStatus, bet.expires_at]);

  void tick;

  const effectiveStatus = useMemo(
    () => getEffectiveBetStatus(bet, new Date()),
    // `tick` forces re-evaluation each second so an OPEN bet flips to EXPIRED at the right time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bet, tick],
  );

  const offererName = bet.offered_by_profile?.display_name ?? 'Someone';
  const acceptorName = bet.accepted_by_profile?.display_name ?? 'Someone';
  const pill = getBetStatusPill(effectiveStatus);

  const dimmed = effectiveStatus === 'EXPIRED' || effectiveStatus === 'VOID';

  const winnerName = useMemo(() => {
    if (dbStatus !== 'SETTLED') return null;
    if (bet.winner === bet.offered_by) return offererName;
    if (bet.winner === bet.accepted_by) return acceptorName;
    return 'Someone';
  }, [dbStatus, bet.winner, bet.offered_by, bet.accepted_by, offererName, acceptorName]);

  const showHeaderAvatar =
    effectiveStatus === 'OPEN' ||
    effectiveStatus === 'SETTLED' ||
    effectiveStatus === 'EXPIRED' ||
    effectiveStatus === 'VOID';
  const showVsHeader =
    dbStatus === 'MATCHED' || dbStatus === 'PENDING_RESULT' || dbStatus === 'DISPUTED';

  const countdown =
    effectiveStatus === 'OPEN' ? formatBetCountdown(bet.expires_at, new Date()) : null;

  const picks =
    bet.offered_pick && bet.accepted_pick
      ? { offered: bet.offered_pick, accepted: bet.accepted_pick }
      : null;

  return (
    <View
      className={`mb-3 rounded-2xl border border-border bg-surface px-4 py-3.5 ${dimmed ? 'opacity-60' : ''}`}
    >
      <View className="flex-row items-center justify-between gap-2">
        {showHeaderAvatar ? (
          <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
            <Avatar uri={bet.offered_by_profile?.avatar_url} fallback={offererName} size="md" />
            <Text className="min-w-0 flex-1 text-base text-text-secondary" numberOfLines={1}>
              <Text className="font-semibold text-white">{offererName}</Text>
              {' posted'}
            </Text>
          </View>
        ) : showVsHeader ? (
          <Text className="min-w-0 flex-1 text-base text-text-secondary" numberOfLines={2}>
            <Text className="font-semibold text-white">{offererName}</Text>
            {' vs '}
            <Text className="font-semibold text-white">{acceptorName}</Text>
          </Text>
        ) : (
          <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
            <Avatar uri={bet.offered_by_profile?.avatar_url} fallback={offererName} size="md" />
            <Text className="text-base text-text-secondary" numberOfLines={1}>
              <Text className="font-semibold text-white">{offererName}</Text>
            </Text>
          </View>
        )}
        <Badge
          variant={pill.variant}
          label={pill.label}
          className="shrink-0 px-3 py-1.5"
          labelClassName="text-[11px] font-bold tracking-wide"
        />
      </View>

      <Text className="mt-3 text-lg font-bold leading-6 text-white" numberOfLines={4}>
        {bet.question}
      </Text>

      {picks &&
      (dbStatus === 'MATCHED' || dbStatus === 'PENDING_RESULT' || dbStatus === 'DISPUTED') ? (
        <View className="mt-3 flex-row items-stretch gap-2">
          <View className="min-w-0 flex-1 rounded-xl border border-border bg-surface-light px-2 py-2.5">
            <Text className="text-center text-xs font-semibold text-primary" numberOfLines={1}>
              {offererName}
            </Text>
            <Text className="mt-0.5 text-center text-sm font-bold text-white" numberOfLines={1}>
              {picks.offered}
            </Text>
          </View>
          <View className="justify-center px-0.5">
            <Text className="text-[10px] font-bold tracking-widest text-text-muted">VS</Text>
          </View>
          <View className="min-w-0 flex-1 rounded-xl border border-border bg-surface-light px-2 py-2.5">
            <Text className="text-center text-xs font-semibold text-error" numberOfLines={1}>
              {acceptorName}
            </Text>
            <Text className="mt-0.5 text-center text-sm font-bold text-white" numberOfLines={1}>
              {picks.accepted}
            </Text>
          </View>
        </View>
      ) : null}

      <View className="mt-3 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <View className="flex-row items-center gap-1.5">
          <Coins size={20} color={colors.chipsIcon} weight="fill" />
          <Text className="text-base font-semibold text-white">{formatStakeChips(bet.stake)}</Text>
        </View>

        {countdown ? (
          <View className="flex-row items-center gap-1.5">
            <Timer size={18} color={colors.warning} weight="bold" />
            <Text className="text-sm font-semibold text-warning">{countdown}</Text>
          </View>
        ) : null}

        {dbStatus === 'SETTLED' && winnerName ? (
          <View className="flex-row items-center gap-1.5">
            <Check size={18} color={colors.primary} weight="bold" />
            <Text className="text-sm font-semibold text-primary">Winner: {winnerName}</Text>
          </View>
        ) : null}

        {dbStatus === 'DISPUTED' ? (
          <View className="flex-row items-center gap-1.5">
            <Warning size={18} color={colors.warning} weight="fill" />
            <Text className="text-sm font-semibold text-warning">Needs review</Text>
          </View>
        ) : null}
      </View>

      <Text className="mt-2 text-xs text-text-muted">{formatRelativeActivityTime(timestamp)}</Text>

      {showAcceptHint ? (
        <View className="mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 py-3">
          <ArrowRight size={18} color={colors.primary} weight="bold" />
          <Text className="text-sm font-semibold text-primary">Swipe to accept</Text>
        </View>
      ) : null}
    </View>
  );
}

interface ActivityFeedItemProps {
  item: ActivityItem;
  /** Current user's id — used to gate the Accept swipe so users can't accept their own offers. */
  currentUserId?: string | null;
  /** When false, accept affordance is hidden (e.g., session ended). */
  roomActive?: boolean;
  /** Room id, required by the accept mutation for cache invalidation. */
  roomId?: string;
}

export function ActivityFeedItem({
  item,
  currentUserId,
  roomActive,
  roomId,
}: ActivityFeedItemProps) {
  if (item.type === 'bet') {
    const canAccept =
      roomActive &&
      !!roomId &&
      !!currentUserId &&
      item.bet.status === 'OPEN' &&
      item.bet.offered_by !== currentUserId &&
      getEffectiveBetStatus(item.bet) !== 'EXPIRED';

    const card = (
      <BetActivityCard bet={item.bet} timestamp={item.timestamp} showAcceptHint={canAccept} />
    );

    if (canAccept) {
      return (
        <SwipeToAcceptRow bet={item.bet} roomId={roomId!}>
          {card}
        </SwipeToAcceptRow>
      );
    }
    return card;
  }

  const { chipRequest } = item;
  const requesterName = chipRequest.requested_by_profile?.display_name ?? 'Someone';
  const statusBadge =
    chipRequest.status === 'FULFILLED'
      ? { variant: 'success' as const, label: 'Fulfilled' }
      : chipRequest.status === 'EXPIRED'
        ? { variant: 'default' as const, label: 'Expired' }
        : { variant: 'default' as const, label: 'Open' };

  return (
    <View className="mb-3 rounded-2xl border border-border bg-surface px-4 py-3.5">
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
          <Avatar
            uri={chipRequest.requested_by_profile?.avatar_url}
            fallback={requesterName.charAt(0)}
            size="md"
          />
          <Text className="min-w-0 flex-1 text-base text-text-secondary" numberOfLines={2}>
            <Text className="font-semibold text-white">{requesterName}</Text>
            {' requested chips'}
          </Text>
        </View>
        <Badge
          variant={statusBadge.variant}
          label={statusBadge.label}
          className="shrink-0 px-3 py-1.5"
          labelClassName="text-[11px] font-bold tracking-wide"
        />
      </View>
      {chipRequest.current_balance != null && (
        <View className="mt-3 flex-row items-center gap-1.5">
          <Coins size={20} color={colors.chipsIcon} weight="fill" />
          <Text className="text-base text-text-secondary">
            Balance: {chipRequest.current_balance.toLocaleString('en-US')}
          </Text>
        </View>
      )}
      <Text className="mt-2 text-xs text-text-muted">
        {formatRelativeActivityTime(item.timestamp)}
      </Text>
    </View>
  );
}
