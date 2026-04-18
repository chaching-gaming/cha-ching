import { useEffect, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ArrowRight, Check, Coins, Timer, Trophy, Warning } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ResolveDisputeSheet } from '@/components/activity/resolve-dispute-sheet';
import { SubmitOutcomeSheet } from '@/components/activity/submit-outcome-sheet';
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

  const countdown =
    effectiveStatus === 'OPEN' ? formatBetCountdown(bet.expires_at, new Date()) : null;

  const showSubmissionStatus = dbStatus === 'MATCHED' || dbStatus === 'PENDING_RESULT';
  const offererSubmitted = useMemo(
    () => bet.outcome_submissions.some((s) => s.user_id === bet.offered_by),
    [bet.outcome_submissions, bet.offered_by],
  );
  const acceptorSubmitted = useMemo(
    () => bet.outcome_submissions.some((s) => s.user_id === bet.accepted_by),
    [bet.outcome_submissions, bet.accepted_by],
  );
  const submittedCount = (offererSubmitted ? 1 : 0) + (acceptorSubmitted ? 1 : 0);
  const mySubmission = useMemo(
    () =>
      currentUserId
        ? (bet.outcome_submissions.find((s) => s.user_id === currentUserId) ?? null)
        : null,
    [bet.outcome_submissions, currentUserId],
  );
  const isParticipant =
    !!currentUserId && (currentUserId === bet.offered_by || currentUserId === bet.accepted_by);
  const canSubmitOutcome =
    !!roomActive && !!roomId && isParticipant && !mySubmission && showSubmissionStatus;

  const canResolveDispute =
    dbStatus === 'DISPUTED' &&
    !!roomId &&
    (currentUserRole === 'ATTESTOR' || currentUserRole === 'ADMIN');

  return (
    <View
      className={`mb-3 rounded-2xl border border-border bg-surface px-4 py-3.5 ${dimmed ? 'opacity-60' : ''}`}
    >
      <View className="mb-3 flex-row items-center justify-between gap-2">
        <Text className="text-xs font-semibold uppercase tracking-widest text-text-muted">
          {effectiveStatus === 'OPEN'
            ? `${offererName}'s offer`
            : effectiveStatus === 'EXPIRED' || effectiveStatus === 'VOID'
              ? `${offererName}'s offer`
              : `${offererName} vs ${acceptorName}`}
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

      {bet.offered_pick ? (
        <PicksMatchup
          offererName={offererName}
          offererAvatar={bet.offered_by_profile?.avatar_url}
          offererPick={bet.offered_pick}
          offererIsWinner={dbStatus === 'SETTLED' && bet.winner === bet.offered_by}
          acceptorName={acceptorName}
          acceptorAvatar={bet.accepted_by_profile?.avatar_url ?? null}
          acceptorPick={bet.accepted_pick}
          acceptorIsWinner={dbStatus === 'SETTLED' && bet.winner === bet.accepted_by}
          oppositePickHint={getOppositeOption(bet)}
          isOpen={effectiveStatus === 'OPEN'}
        />
      ) : null}

      {showSubmissionStatus ? (
        <View className="mt-3 flex-row items-center gap-3 rounded-xl border border-border bg-surface-light px-3 py-2.5">
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-white">{submittedCount}/2 submitted</Text>
            {mySubmission ? (
              <Text className="mt-0.5 text-xs font-medium text-primary" numberOfLines={1}>
                ✓ You reported &ldquo;{mySubmission.selected_option}&rdquo;
              </Text>
            ) : null}
          </View>
          <View className="flex-row items-center gap-2.5">
            <SubmissionAvatar
              uri={bet.offered_by_profile?.avatar_url}
              fallback={offererName}
              submitted={offererSubmitted}
            />
            <SubmissionAvatar
              uri={bet.accepted_by_profile?.avatar_url}
              fallback={acceptorName}
              submitted={acceptorSubmitted}
            />
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
            <Trophy size={18} color={colors.primary} weight="fill" />
            <Text className="text-sm font-semibold text-primary">
              {winnerName} +{(2 * bet.stake).toLocaleString('en-US')}
            </Text>
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

      {canSubmitOutcome ? (
        <TouchableOpacity
          onPress={() => setSubmitSheetOpen(true)}
          activeOpacity={0.8}
          className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3"
        >
          <Check size={18} color="#ffffff" weight="bold" />
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
          className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-warning py-3"
        >
          <Warning size={18} color="#ffffff" weight="bold" />
          <Text className="text-sm font-bold text-white">Resolve dispute</Text>
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
    </View>
  );
}

function getOppositeOption(bet: BetWithProfiles): string | null {
  const opts = Array.isArray(bet.options) ? (bet.options as unknown[]) : [];
  const offered = bet.offered_pick?.trim().toLowerCase();
  const candidate = opts.find((o) => typeof o === 'string' && o.trim().toLowerCase() !== offered);
  return typeof candidate === 'string' ? candidate : null;
}

function PickPill({ label, variant }: { label: string; variant: 'primary' | 'error' | 'ghost' }) {
  const containerClass =
    variant === 'primary'
      ? 'border-primary bg-primary/15'
      : variant === 'error'
        ? 'border-error bg-error/15'
        : 'border-border bg-surface-light opacity-60';
  const textClass =
    variant === 'primary' ? 'text-primary' : variant === 'error' ? 'text-error' : 'text-text-muted';
  return (
    <View className={`rounded-full border-2 px-4 py-1 ${containerClass}`}>
      <Text className={`text-sm font-bold ${textClass}`}>{label.toUpperCase()}</Text>
    </View>
  );
}

function PicksMatchup({
  offererName,
  offererAvatar,
  offererPick,
  offererIsWinner,
  acceptorName,
  acceptorAvatar,
  acceptorPick,
  acceptorIsWinner,
  oppositePickHint,
  isOpen,
}: {
  offererName: string;
  offererAvatar?: string | null;
  offererPick: string;
  offererIsWinner: boolean;
  acceptorName: string;
  acceptorAvatar?: string | null;
  acceptorPick: string | null;
  acceptorIsWinner: boolean;
  oppositePickHint: string | null;
  isOpen: boolean;
}) {
  const acceptorSlotEmpty = isOpen || !acceptorPick;
  return (
    <View className="mt-4 flex-row items-center gap-3">
      <PlayerSide
        name={offererName}
        avatarUri={offererAvatar}
        pick={offererPick}
        pickVariant="primary"
        isWinner={offererIsWinner}
        dim={acceptorIsWinner}
      />

      <View className="items-center">
        <Text className="text-[10px] font-bold tracking-widest text-text-muted">VS</Text>
      </View>

      {acceptorSlotEmpty ? (
        <PlayerSide
          name="Open"
          avatarUri={null}
          pick={oppositePickHint ?? '—'}
          pickVariant="ghost"
          isWinner={false}
          dim={false}
          ghost
        />
      ) : (
        <PlayerSide
          name={acceptorName}
          avatarUri={acceptorAvatar}
          pick={acceptorPick ?? '—'}
          pickVariant="error"
          isWinner={acceptorIsWinner}
          dim={offererIsWinner}
        />
      )}
    </View>
  );
}

function PlayerSide({
  name,
  avatarUri,
  pick,
  pickVariant,
  isWinner,
  dim,
  ghost,
}: {
  name: string;
  avatarUri?: string | null;
  pick: string;
  pickVariant: 'primary' | 'error' | 'ghost';
  isWinner: boolean;
  dim: boolean;
  ghost?: boolean;
}) {
  return (
    <View className={`flex-1 items-center gap-2 ${dim ? 'opacity-50' : ''}`}>
      <View className="relative">
        <Avatar
          uri={avatarUri}
          fallback={ghost ? '?' : name}
          size="lg"
          className={ghost ? 'opacity-40' : ''}
        />
        {isWinner ? (
          <View className="absolute -right-1.5 -top-1.5 h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-primary">
            <Trophy size={14} color="#ffffff" weight="fill" />
          </View>
        ) : null}
      </View>
      <Text className="text-center text-xs font-semibold text-text-secondary" numberOfLines={1}>
        {name}
      </Text>
      <PickPill label={pick} variant={pickVariant} />
    </View>
  );
}

function SubmissionAvatar({
  uri,
  fallback,
  submitted,
}: {
  uri?: string | null;
  fallback: string;
  submitted: boolean;
}) {
  return (
    <View className="relative">
      <Avatar uri={uri} fallback={fallback} size="sm" className={submitted ? '' : 'opacity-40'} />
      {submitted ? (
        <View className="absolute -bottom-0.5 -right-0.5 h-4 w-4 items-center justify-center rounded-full border-2 border-surface-light bg-primary">
          <Check size={8} color="#ffffff" weight="bold" />
        </View>
      ) : null}
    </View>
  );
}

interface ActivityFeedItemProps {
  item: ActivityItem;
  /** Current user's id — used to gate the Accept swipe so users can't accept their own offers. */
  currentUserId?: string | null;
  /** Current user's room role — gates the attestor "Resolve dispute" action. */
  currentUserRole?: 'PLAYER' | 'ATTESTOR' | 'ADMIN' | string | null;
  /** When false, accept affordance is hidden (e.g., session ended). */
  roomActive?: boolean;
  /** Room id, required by the accept mutation for cache invalidation. */
  roomId?: string;
}

export function ActivityFeedItem({
  item,
  currentUserId,
  currentUserRole,
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
      <BetActivityCard
        bet={item.bet}
        timestamp={item.timestamp}
        showAcceptHint={canAccept}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        roomActive={roomActive}
        roomId={roomId}
      />
    );

    if (canAccept) {
      return <SwipeToAcceptRow bet={item.bet}>{card}</SwipeToAcceptRow>;
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
