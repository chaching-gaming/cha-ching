import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import {
  ArrowRight,
  Check,
  Coins,
  HandCoins,
  HandHeart,
  Prohibit,
  Timer,
  Trophy,
  Warning,
} from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DonateChipsSheet } from '@/components/activity/donate-chips-sheet';
import { ResolveDisputeSheet } from '@/components/activity/resolve-dispute-sheet';
import { SubmitOutcomeSheet } from '@/components/activity/submit-outcome-sheet';
import { SwipeToAcceptRow } from '@/components/activity/swipe-to-accept-row';
import { VoidBetSheet } from '@/components/activity/void-bet-sheet';
import { useCancelChipRequest } from '@/hooks/use-chip-requests';
import { getRpcErrorMessage } from '@/hooks/use-rooms';
import type {
  ActivityItem,
  BetStakeWithProfile,
  BetVoidLogWithProfile,
  BetWithProfiles,
  ChipRequestWithProfile,
} from '@/hooks/use-activity-feed';
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
  currentUserId,
  currentUserRole,
  roomActive,
  roomId,
}: {
  bet: BetWithProfiles;
  timestamp: string;
  showAcceptHint?: boolean;
  currentUserId?: string | null;
  currentUserRole?: 'PLAYER' | 'ATTESTOR' | 'ADMIN' | string | null;
  roomActive?: boolean;
  roomId?: string;
}) {
  const [tick, setTick] = useState(0);
  const [submitSheetOpen, setSubmitSheetOpen] = useState(false);
  const [disputeSheetOpen, setDisputeSheetOpen] = useState(false);
  const [voidSheetOpen, setVoidSheetOpen] = useState(false);
  const dbStatus = bet.status ?? '';

  useEffect(() => {
    if (dbStatus !== 'OPEN' || !bet.expires_at) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [dbStatus, bet.expires_at]);

  void tick;

  const effectiveStatus = useMemo(
    () => getEffectiveBetStatus(bet, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bet, tick],
  );

  const options = useMemo(() => {
    const raw = Array.isArray(bet.options) ? (bet.options as unknown[]) : [];
    return raw.filter((o): o is string => typeof o === 'string' && o.trim().length > 0);
  }, [bet.options]);

  const stakes = useMemo(() => bet.stakes ?? [], [bet.stakes]);
  const stakesByPick = useMemo(() => groupStakesByPick(options, stakes), [options, stakes]);

  const pool = stakes.length * (bet.stake ?? 0);
  const pill = getBetStatusPill(effectiveStatus);
  const dimmed = effectiveStatus === 'EXPIRED' || effectiveStatus === 'VOID';

  const subjectName = bet.subject_profile?.display_name ?? null;
  const offererName = bet.offered_by_profile?.display_name ?? 'Someone';

  const countdown =
    effectiveStatus === 'OPEN' ? formatBetCountdown(bet.expires_at, new Date()) : null;

  // Winners = stakes whose pick matches bet.outcome. Per-winner payout is the
  // pool split evenly (integer division; remainder truncated server-side too).
  const winningStakes = useMemo(() => {
    if (dbStatus !== 'SETTLED' || !bet.outcome) return [] as BetStakeWithProfile[];
    const outcome = bet.outcome.trim().toLowerCase();
    return stakes.filter((s) => s.pick.trim().toLowerCase() === outcome);
  }, [dbStatus, bet.outcome, stakes]);

  const perWinnerPayout = winningStakes.length > 0 ? Math.floor(pool / winningStakes.length) : 0;
  const currentUserWon = !!currentUserId && winningStakes.some((s) => s.user_id === currentUserId);

  // Check if both sides are staked (for "waiting" message when OPEN)
  const distinctPicksStaked = useMemo(() => {
    const set = new Set(stakes.map((s) => s.pick.trim().toLowerCase()));
    return set.size;
  }, [stakes]);
  const bothSidesStaked = distinctPicksStaked >= 2;

  // Show submission status only when bet is PENDING_RESULT (after expiry)
  const showSubmissionStatus = dbStatus === 'PENDING_RESULT';

  // Show "waiting" message when bet is OPEN with both sides staked
  const showWaitingForClose = dbStatus === 'OPEN' && bothSidesStaked;
  const totalParticipants = stakes.length;
  const submittedCount = bet.outcome_submissions.length;
  const mySubmission = useMemo(
    () =>
      currentUserId
        ? (bet.outcome_submissions.find((s) => s.user_id === currentUserId) ?? null)
        : null,
    [bet.outcome_submissions, currentUserId],
  );

  const isParticipant = !!currentUserId && stakes.some((s) => s.user_id === currentUserId);

  // Only allow outcome submission when PENDING_RESULT (after expiry)
  const canSubmitOutcome =
    !!roomActive && !!roomId && isParticipant && !mySubmission && dbStatus === 'PENDING_RESULT';

  // Allow resolve for both DISPUTED and PENDING_RESULT bets
  const canResolveDispute =
    (dbStatus === 'DISPUTED' || dbStatus === 'PENDING_RESULT') &&
    !!roomId &&
    (currentUserRole === 'ATTESTOR' || currentUserRole === 'ADMIN');

  const canVoid = !!roomId && currentUserRole === 'ADMIN' && dbStatus !== 'VOID';

  // Header subtitle: for SETTLED/VOID we lean on the badge; otherwise show
  // "about <subject>" if the bet has a subject distinct from the creator.
  const subtitle = subjectName
    ? subjectName === offererName
      ? `${offererName}'s offer`
      : `${offererName} · about ${subjectName}`
    : `${offererName}'s offer`;

  return (
    <View
      className={`mb-3 rounded-2xl border border-border bg-surface px-4 py-3.5 ${dimmed ? 'opacity-60' : ''}`}
    >
      <View className="mb-3 flex-row items-center justify-between gap-2">
        <Text
          className="shrink text-xs font-semibold uppercase tracking-widest text-text-muted"
          numberOfLines={1}
        >
          {subtitle}
        </Text>
        <Badge
          variant={pill.variant}
          label={pill.label}
          className="shrink-0 px-3 py-1.5"
          labelClassName="text-[11px] font-bold tracking-wide"
        />
      </View>

      <Text className="text-lg font-bold leading-6 text-white" numberOfLines={4}>
        {bet.question}
      </Text>

      {options.length > 0 ? (
        <PoolTally
          options={options}
          stakesByPick={stakesByPick}
          winningPick={dbStatus === 'SETTLED' ? bet.outcome : null}
          currentUserId={currentUserId ?? null}
        />
      ) : null}

      {showSubmissionStatus ? (
        <View className="mt-3 flex-row items-center gap-3 rounded-xl border border-border bg-surface-light px-3 py-2.5">
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-white">
              {submittedCount}/{totalParticipants} submitted
            </Text>
            {mySubmission ? (
              <Text className="mt-0.5 text-xs font-medium text-primary" numberOfLines={1}>
                ✓ You reported &ldquo;{mySubmission.selected_option}&rdquo;
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {showWaitingForClose && isParticipant ? (
        <View className="mt-3 flex-row items-center gap-3 rounded-xl border border-border bg-surface-light px-3 py-2.5">
          <Timer size={20} color={colors.warning} weight="bold" />
          <Text className="flex-1 text-sm font-medium text-text-secondary">
            Waiting for bet to close before outcomes can be submitted
          </Text>
        </View>
      ) : null}

      <View className="mt-3 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <View className="flex-row items-center gap-1.5">
          <Coins size={20} color={colors.chipsIcon} weight="fill" />
          <Text className="text-base font-semibold text-white">
            {formatStakeChips(bet.stake)} · pool {pool.toLocaleString('en-US')}
          </Text>
        </View>

        {countdown ? (
          <View className="flex-row items-center gap-1.5">
            <Timer size={18} color={colors.warning} weight="bold" />
            <Text className="text-sm font-semibold text-warning">{countdown}</Text>
          </View>
        ) : null}

        {dbStatus === 'SETTLED' && bet.outcome ? (
          <View className="flex-row items-center gap-1.5">
            <Trophy size={18} color={colors.primary} weight="fill" />
            <Text className="text-sm font-semibold text-primary">
              {bet.outcome.toUpperCase()}
              {perWinnerPayout > 0
                ? ` · +${perWinnerPayout.toLocaleString('en-US')}${
                    winningStakes.length > 1 ? ' each' : ''
                  }`
                : ''}
              {currentUserWon ? ' · you won' : ''}
            </Text>
          </View>
        ) : null}

        {dbStatus === 'VOID' ? <VoidFooter voidLog={bet.void_logs?.[0] ?? null} /> : null}

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
          <Text className="text-sm font-semibold text-primary">Swipe to join</Text>
        </View>
      ) : null}

      {canSubmitOutcome ? (
        <TouchableOpacity
          onPress={() => setSubmitSheetOpen(true)}
          activeOpacity={0.8}
          className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3"
        >
          <Check size={18} color={colors.textPrimary} weight="bold" />
          <Text className="text-sm font-bold text-white">Submit outcome</Text>
        </TouchableOpacity>
      ) : null}

      {canSubmitOutcome && roomId ? (
        <SubmitOutcomeSheet
          visible={submitSheetOpen}
          onClose={() => setSubmitSheetOpen(false)}
          bet={bet}
          roomId={roomId}
        />
      ) : null}

      {canResolveDispute ? (
        <TouchableOpacity
          onPress={() => setDisputeSheetOpen(true)}
          activeOpacity={0.8}
          className={`mt-3 flex-row items-center justify-center gap-2 rounded-xl py-3 ${
            dbStatus === 'DISPUTED' ? 'bg-warning' : 'bg-primary'
          }`}
        >
          {dbStatus === 'DISPUTED' ? (
            <Warning size={18} color={colors.textPrimary} weight="bold" />
          ) : (
            <Check size={18} color={colors.textPrimary} weight="bold" />
          )}
          <Text className="text-sm font-bold text-white">
            {dbStatus === 'DISPUTED' ? 'Resolve dispute' : 'Settle bet'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {canResolveDispute && roomId ? (
        <ResolveDisputeSheet
          visible={disputeSheetOpen}
          onClose={() => setDisputeSheetOpen(false)}
          bet={bet}
          roomId={roomId}
        />
      ) : null}

      {canVoid ? (
        <TouchableOpacity
          onPress={() => setVoidSheetOpen(true)}
          activeOpacity={0.8}
          accessibilityLabel="Void this bet (admin only)"
          className="mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface-light py-3"
        >
          <Prohibit size={18} color={colors.textMuted} weight="bold" />
          <Text className="text-sm font-bold text-text-muted">Void bet</Text>
        </TouchableOpacity>
      ) : null}

      {canVoid && roomId ? (
        <VoidBetSheet
          visible={voidSheetOpen}
          onClose={() => setVoidSheetOpen(false)}
          bet={bet}
          roomId={roomId}
        />
      ) : null}
    </View>
  );
}

function VoidFooter({ voidLog }: { voidLog: BetVoidLogWithProfile | null }) {
  // Non-admin clients get void_logs = [] from RLS, so voidLog is null — we show
  // the generic message. Admins see the actor + (optional) reason.
  const voidedByName = voidLog?.voided_by_profile?.display_name?.trim();
  const reason = voidLog?.reason?.trim();
  const primary = voidedByName
    ? `Voided by ${voidedByName} · stakes refunded`
    : 'Voided · stakes refunded';

  return (
    <View className="min-w-0 shrink flex-row items-start gap-1.5">
      <Warning size={18} color={colors.textMuted} weight="fill" style={{ marginTop: 2 }} />
      <View className="min-w-0 shrink">
        <Text className="text-sm font-semibold text-text-muted">{primary}</Text>
        {reason ? (
          <Text className="text-xs text-text-muted" numberOfLines={2}>{`“${reason}”`}</Text>
        ) : null}
      </View>
    </View>
  );
}

function groupStakesByPick(
  options: string[],
  stakes: BetStakeWithProfile[],
): Record<string, BetStakeWithProfile[]> {
  const out: Record<string, BetStakeWithProfile[]> = {};
  for (const option of options) out[option] = [];
  for (const stake of stakes) {
    const key = options.find((o) => o.trim().toLowerCase() === stake.pick.trim().toLowerCase());
    if (key) out[key].push(stake);
  }
  return out;
}

function PoolTally({
  options,
  stakesByPick,
  winningPick,
  currentUserId,
}: {
  options: string[];
  stakesByPick: Record<string, BetStakeWithProfile[]>;
  winningPick: string | null;
  currentUserId: string | null;
}) {
  if (options.length === 0) return null;
  return (
    <View className="mt-3 flex-row items-stretch gap-2">
      {options.map((option, idx) => {
        const list = stakesByPick[option] ?? [];
        const tone = idx === 0 ? 'primary' : 'error';
        const isWinner =
          !!winningPick && option.trim().toLowerCase() === winningPick.trim().toLowerCase();
        const youOnThisSide = !!currentUserId && list.some((s) => s.user_id === currentUserId);
        return (
          <PoolSide
            key={option}
            label={option}
            count={list.length}
            stakes={list}
            tone={tone}
            isWinner={isWinner}
            youOnThisSide={youOnThisSide}
          />
        );
      })}
    </View>
  );
}

function PoolSide({
  label,
  count,
  stakes,
  tone,
  isWinner,
  youOnThisSide,
}: {
  label: string;
  count: number;
  stakes: BetStakeWithProfile[];
  tone: 'primary' | 'error';
  isWinner: boolean;
  youOnThisSide: boolean;
}) {
  const borderClass = isWinner
    ? 'border-primary'
    : tone === 'primary'
      ? 'border-border'
      : 'border-border';
  const labelClass = tone === 'primary' ? 'text-primary' : 'text-error';
  const bgClass = isWinner ? 'bg-primary/10' : 'bg-surface-light';
  return (
    <View className={`min-w-0 flex-1 rounded-xl border-2 ${borderClass} ${bgClass} px-3 py-2.5`}>
      <View className="flex-row items-center justify-between">
        <Text
          className={`text-sm font-bold uppercase tracking-wide ${labelClass}`}
          numberOfLines={1}
        >
          {label}
        </Text>
        {isWinner ? <Trophy size={14} color={colors.primary} weight="fill" /> : null}
      </View>
      <Text className="mt-1 text-xs text-text-secondary">
        {count === 0 ? 'no backers' : count === 1 ? '1 backer' : `${count} backers`}
        {youOnThisSide ? ' · you' : ''}
      </Text>
      {count > 0 ? <StakeAvatars stakes={stakes} /> : null}
    </View>
  );
}

function StakeAvatars({ stakes }: { stakes: BetStakeWithProfile[] }) {
  const shown = stakes.slice(0, 3);
  const overflow = stakes.length - shown.length;
  return (
    <View className="mt-2 flex-row items-center">
      {shown.map((stake, idx) => (
        <View
          key={stake.id}
          className={`rounded-full border-2 border-surface ${idx > 0 ? '-ml-2' : ''}`}
          style={{ zIndex: 10 - idx }}
        >
          <Avatar
            uri={stake.user?.avatar_url}
            fallback={stake.user?.display_name ?? '?'}
            size="sm"
          />
        </View>
      ))}
      {overflow > 0 ? (
        <View className="-ml-2 h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-surface-light">
          <Text className="text-[10px] font-semibold text-text-secondary">+{overflow}</Text>
        </View>
      ) : null}
    </View>
  );
}

interface ActivityFeedItemProps {
  item: ActivityItem;
  /** Current user's id — used to gate joining (can't join own bet, can't join twice). */
  currentUserId?: string | null;
  /** Current user's room role — gates the attestor "Resolve dispute" action. */
  currentUserRole?: 'PLAYER' | 'ATTESTOR' | 'ADMIN' | string | null;
  /** When false, join/donate affordances are hidden (e.g., session ended). */
  roomActive?: boolean;
  /** Room id, required by the join mutation for cache invalidation. */
  roomId?: string;
  /** Current user's balance — forwarded to the donate sheet for validation. */
  currentUserBalance?: number;
}

export function ActivityFeedItem({
  item,
  currentUserId,
  currentUserRole,
  roomActive,
  roomId,
  currentUserBalance,
}: ActivityFeedItemProps) {
  if (item.type === 'bet') {
    const stakes = item.bet.stakes ?? [];
    const alreadyStaked = !!currentUserId && stakes.some((s) => s.user_id === currentUserId);
    const subjectDisallowed =
      !!currentUserId &&
      item.bet.subject_user_id === currentUserId &&
      !!item.bet.subject_positive_option;
    // We still show the swipe gate for subjects — the accept screen will lock
    // the disallowed tile. Only hide it if they literally can't join at all,
    // which never happens since the allowed side is always open.
    void subjectDisallowed;
    const canJoin =
      roomActive &&
      !!roomId &&
      !!currentUserId &&
      item.bet.status === 'OPEN' &&
      !alreadyStaked &&
      getEffectiveBetStatus(item.bet) !== 'EXPIRED';

    const card = (
      <BetActivityCard
        bet={item.bet}
        timestamp={item.timestamp}
        showAcceptHint={canJoin}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        roomActive={roomActive}
        roomId={roomId}
      />
    );

    if (canJoin) {
      return <SwipeToAcceptRow bet={item.bet}>{card}</SwipeToAcceptRow>;
    }
    return card;
  }

  return (
    <ChipRequestActivityCard
      chipRequest={item.chipRequest}
      timestamp={item.timestamp}
      currentUserId={currentUserId}
      roomActive={roomActive}
      roomId={roomId}
      currentUserBalance={currentUserBalance}
    />
  );
}

function ChipRequestActivityCard({
  chipRequest,
  timestamp,
  currentUserId,
  roomActive,
  roomId,
  currentUserBalance,
}: {
  chipRequest: ChipRequestWithProfile;
  timestamp: string;
  currentUserId?: string | null;
  roomActive?: boolean;
  roomId?: string;
  currentUserBalance?: number;
}) {
  const [donateOpen, setDonateOpen] = useState(false);
  const cancelRequest = useCancelChipRequest();

  const requesterName = chipRequest.requested_by_profile?.display_name ?? 'Someone';
  const status = chipRequest.status ?? 'OPEN';

  const statusBadge =
    status === 'FULFILLED'
      ? { variant: 'success' as const, label: 'Fulfilled' }
      : status === 'EXPIRED'
        ? { variant: 'default' as const, label: 'Cancelled' }
        : { variant: 'matched' as const, label: 'Open' };

  const requested = chipRequest.requested_amount;
  const fulfilled = chipRequest.fulfilled_amount;
  const remaining = Math.max(0, requested - fulfilled);
  const progressPercent =
    requested > 0 ? Math.min(100, Math.round((fulfilled / requested) * 100)) : 0;

  const isRequester = !!currentUserId && chipRequest.requested_by === currentUserId;
  const canDonate =
    !!roomActive &&
    !!roomId &&
    !!currentUserId &&
    !isRequester &&
    status === 'OPEN' &&
    remaining > 0 &&
    currentUserBalance != null;

  const canCancel = !!roomActive && isRequester && status === 'OPEN' && fulfilled === 0 && !!roomId;

  const dimmed = status !== 'OPEN';

  const handleCancel = useCallback(() => {
    if (!roomId) return;
    Alert.alert('Cancel this request?', 'The chip request will be removed from the feed.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelRequest.mutateAsync({
              p_chip_request_id: chipRequest.id,
              roomId,
            });
          } catch (err) {
            Alert.alert('Could not cancel', getRpcErrorMessage(err, 'Please try again.'));
          }
        },
      },
    ]);
  }, [cancelRequest, chipRequest.id, roomId]);

  return (
    <View
      className={`mb-3 rounded-2xl border border-border bg-surface px-4 py-3.5 ${dimmed ? 'opacity-70' : ''}`}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
          <Avatar
            uri={chipRequest.requested_by_profile?.avatar_url}
            fallback={requesterName.charAt(0)}
            size="md"
          />
          <View className="min-w-0 flex-1">
            <Text className="text-base font-semibold text-white" numberOfLines={1}>
              {requesterName}
            </Text>
            <View className="mt-0.5 flex-row items-center gap-1">
              <HandHeart size={14} color={colors.primary} weight="fill" />
              <Text className="text-xs text-text-secondary" numberOfLines={1}>
                {isRequester ? 'you need chips' : 'needs chips'}
              </Text>
            </View>
          </View>
        </View>
        <Badge
          variant={statusBadge.variant}
          label={statusBadge.label}
          className="shrink-0 px-3 py-1.5"
          labelClassName="text-[11px] font-bold tracking-wide"
        />
      </View>

      {chipRequest.message ? (
        <Text className="mt-3 text-sm leading-5 text-text-secondary" numberOfLines={4}>
          &ldquo;{chipRequest.message}&rdquo;
        </Text>
      ) : null}

      <View className="mt-3">
        <View className="mb-1.5 flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <Coins size={18} color={colors.chipsIcon} weight="fill" />
            <Text className="text-sm font-semibold text-white">
              {fulfilled.toLocaleString('en-US')}{' '}
              <Text className="text-text-secondary">of {requested.toLocaleString('en-US')}</Text>
            </Text>
          </View>
          <Text className="text-xs font-bold uppercase tracking-wide text-primary">
            {progressPercent}%
          </Text>
        </View>
        <View className="h-2 overflow-hidden rounded-full bg-surface-light">
          <View
            className="h-full rounded-full bg-primary"
            style={{ width: `${progressPercent}%` }}
          />
        </View>
      </View>

      {chipRequest.current_balance != null ? (
        <Text className="mt-3 text-xs text-text-muted">
          Starting balance: {chipRequest.current_balance.toLocaleString('en-US')}
        </Text>
      ) : null}

      <Text className="mt-1 text-xs text-text-muted">{formatRelativeActivityTime(timestamp)}</Text>

      {canDonate ? (
        <TouchableOpacity
          onPress={() => setDonateOpen(true)}
          activeOpacity={0.8}
          accessibilityLabel={`Donate chips to ${requesterName}`}
          className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3"
        >
          <HandCoins size={18} color={colors.textPrimary} weight="bold" />
          <Text className="text-sm font-bold text-white">Donate chips</Text>
        </TouchableOpacity>
      ) : null}

      {canCancel ? (
        <TouchableOpacity
          onPress={handleCancel}
          disabled={cancelRequest.isPending}
          activeOpacity={0.8}
          accessibilityLabel="Cancel your chip request"
          className="mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface-light py-3"
        >
          <Text className="text-sm font-semibold text-text-muted">
            {cancelRequest.isPending ? 'Cancelling…' : 'Cancel request'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {canDonate && roomId && currentUserBalance != null ? (
        <DonateChipsSheet
          visible={donateOpen}
          onClose={() => setDonateOpen(false)}
          chipRequest={chipRequest}
          roomId={roomId}
          donorBalance={currentUserBalance}
        />
      ) : null}
    </View>
  );
}
