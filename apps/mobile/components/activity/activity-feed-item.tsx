import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Check,
  Coins,
  HandCoins,
  HandHeart,
  Lock,
  Prohibit,
  Timer,
  Trophy,
  Warning,
  X,
} from 'phosphor-react-native';

import { useTheme } from '@/providers/theme';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DonateChipsSheet } from '@/components/activity/donate-chips-sheet';
import { ResolveDisputeSheet } from '@/components/activity/resolve-dispute-sheet';
import { SubmitOutcomeSheet } from '@/components/activity/submit-outcome-sheet';
import { SwipeToConfirmButton } from '@/components/activity/swipe-to-confirm-button';
import { VoidBetSheet } from '@/components/activity/void-bet-sheet';
import { useCancelChipRequest } from '@/hooks/use-chip-requests';
import { useProcessExpiredBet } from '@/hooks/use-process-expired-bet';
import { useQuestionTemplates } from '@/hooks/use-question-templates';
import { getRpcErrorMessage } from '@/hooks/use-rooms';
import type {
  ActivityItem,
  BetStakeWithProfile,
  BetVoidLogWithProfile,
  BetWithProfiles,
  ChipRequestWithProfile,
} from '@/hooks/use-activity-feed';
import {
  formatBetCountdown,
  formatRelativeActivityTime,
  parseApiTimestamp,
} from '@/lib/date-format';
import {
  isMemberInactive,
  type RoomMemberStatus,
} from '@/hooks/use-rooms';
import {
  getEffectiveBetStatus,
  getDisputeWindowRemaining,
  hasDisputeWindowSet,
} from '@/lib/effective-bet-status';
import { useProcessDisputeWindow } from '@/hooks/use-process-settlement-windows';
import { useServerTimeTick } from '@/providers/time';

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
      return { label: 'AWAITING OUTCOMES', variant: 'attestor' };
    case 'PENDING_DISPUTE':
      return { label: 'CONFIRMING RESULT', variant: 'attestor' };
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
  currentUserId,
  currentUserRole,
  roomActive,
  roomId,
  canJoin,
  selectedPick,
  onSelectPick,
  onJoinSuccess,
  onNavigate,
  membershipStatusMap,
}: {
  bet: BetWithProfiles;
  timestamp: string;
  currentUserId?: string | null;
  currentUserRole?: 'PLAYER' | 'ATTESTOR' | 'ADMIN' | string | null;
  roomActive?: boolean;
  roomId?: string;
  canJoin?: boolean;
  selectedPick?: string | null;
  onSelectPick?: (pick: string) => void;
  onJoinSuccess?: () => void;
  onNavigate?: () => void;
  membershipStatusMap?: Map<string, RoomMemberStatus>;
}) {
  const { colors } = useTheme();
  const serverNow = useServerTimeTick();
  const [submitSheetOpen, setSubmitSheetOpen] = useState(false);
  const [disputeSheetOpen, setDisputeSheetOpen] = useState(false);
  const [voidSheetOpen, setVoidSheetOpen] = useState(false);
  const dbStatus = bet.status ?? '';
  const processExpiredBet = useProcessExpiredBet();
  const processDisputeWindow = useProcessDisputeWindow();
  const processedRef = useRef<string | null>(null);
  const disputeProcessedRef = useRef<string | null>(null);

  // Auto-process expired bets immediately (eliminates 0-60s cron lag)
  // Handles client/server clock skew by retrying until server processes the bet
  useEffect(() => {
    if (!roomId) return;
    if (processExpiredBet.isPending) return;
    // Process both OPEN and MATCHED bets when they expire
    if (dbStatus !== 'OPEN' && dbStatus !== 'MATCHED') return;
    if (!bet.expires_at) return;

    // Client-side expiry check using server-synced time
    const expiresAt = new Date(bet.expires_at);
    if (expiresAt > serverNow) return;

    // Don't call RPC again if we're already waiting for retry
    if (processedRef.current === bet.id) return;

    const betId = bet.id;
    const roomIdValue = roomId;

    processExpiredBet.mutate(
      { betId, roomId: roomIdValue },
      {
        onSuccess: (result) => {
          if (result.status === 'OPEN' || result.status === 'MATCHED') {
            // Server clock hasn't reached expiry yet - schedule retry
            setTimeout(() => {
              processedRef.current = null; // Allow retry on next render
            }, 3000);
          }
          processedRef.current = betId;
        },
        onError: () => {
          processedRef.current = null;
        },
      },
    );
  }, [bet.id, bet.expires_at, dbStatus, roomId, processExpiredBet, serverNow]);

  // Note: Client-side outcome window processing removed - windows are now indefinite.
  // Settlement happens when all participants submit (via process_all_submissions on server).

  // Auto-process dispute window when it expires (eliminates cron delay)
  useEffect(() => {
    if (!roomId) return;
    if (processDisputeWindow.isPending) return;
    if (dbStatus !== 'PENDING_DISPUTE') return;

    // IMPORTANT: Only process if dispute_window_ends_at is set and expired
    // If it's null, the server hasn't set it yet - wait for refetch
    if (!bet.dispute_window_ends_at) return;

    // Don't call RPC again if already processed
    if (disputeProcessedRef.current === bet.id) return;

    const remaining = getDisputeWindowRemaining(bet, serverNow);
    if (remaining > 0) return; // Window still open

    const betId = bet.id;
    const roomIdValue = roomId;

    disputeProcessedRef.current = betId; // Mark before calling to prevent duplicate calls
    processDisputeWindow.mutate(
      { p_bet_id: betId, roomId: roomIdValue },
      {
        onError: () => {
          disputeProcessedRef.current = null; // Allow retry on error
        },
      },
    );
  }, [
    bet.id,
    bet.dispute_window_ends_at,
    dbStatus,
    roomId,
    processDisputeWindow.isPending,
    serverNow,
  ]);

  // Get template for contextual labels
  const { data: templates } = useQuestionTemplates('golf');
  const betTemplate = useMemo(() => {
    if (!bet.template_id || !templates) return null;
    return templates.find((t) => t.id === bet.template_id) ?? null;
  }, [bet.template_id, templates]);

  const getDisplayLabel = useCallback(
    (rawOption: string): string => {
      if (!betTemplate) return rawOption;
      const lower = rawOption.trim().toLowerCase();
      if (lower === 'yes') return betTemplate.positive_label;
      if (lower === 'no') return betTemplate.negative_label;
      return rawOption;
    },
    [betTemplate],
  );

  const effectiveStatus = useMemo(() => getEffectiveBetStatus(bet, serverNow), [bet, serverNow]);

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

  // Check if bet has actually expired (expires_at <= now)
  // Use parseApiTimestamp to handle timestamps without timezone (treats as UTC)
  const hasBetExpired = useMemo(() => {
    if (!bet.expires_at) return false;
    const expiresAt = parseApiTimestamp(bet.expires_at);
    if (!expiresAt) return false;
    return expiresAt <= serverNow;
  }, [bet.expires_at, serverNow]);

  // Show countdown for OPEN and MATCHED bets that haven't expired yet
  // (MATCHED means someone joined but not all members, so still waiting for expiry)
  const countdown =
    (effectiveStatus === 'OPEN' || effectiveStatus === 'MATCHED') && !hasBetExpired
      ? formatBetCountdown(bet.expires_at, serverNow)
      : null;

  // Note: Outcome windows are now indefinite - bets stay in PENDING_RESULT until all submit or admin resolves

  // Dispute window countdown for PENDING_DISPUTE status
  const disputeWindowRemaining =
    dbStatus === 'PENDING_DISPUTE' ? getDisputeWindowRemaining(bet, serverNow) : 0;

  // Winners = stakes whose pick matches bet.outcome. Per-winner payout is the
  // pool split evenly (integer division; remainder truncated server-side too).
  const winningStakes = useMemo(() => {
    if (dbStatus !== 'SETTLED' || !bet.outcome) return [] as BetStakeWithProfile[];
    const outcome = bet.outcome.trim().toLowerCase();
    return stakes.filter((s) => s.pick.trim().toLowerCase() === outcome);
  }, [dbStatus, bet.outcome, stakes]);

  const perWinnerPayout = winningStakes.length > 0 ? Math.floor(pool / winningStakes.length) : 0;
  const currentUserWon = !!currentUserId && winningStakes.some((s) => s.user_id === currentUserId);

  // Check if user participated and lost
  const currentUserStake = useMemo(() => {
    if (!currentUserId) return null;
    return stakes.find((s) => s.user_id === currentUserId) ?? null;
  }, [currentUserId, stakes]);
  const currentUserLost = !!currentUserStake && !currentUserWon && dbStatus === 'SETTLED';

  // Check if both sides are staked (for "waiting" message when OPEN)
  const distinctPicksStaked = useMemo(() => {
    const set = new Set(stakes.map((s) => s.pick.trim().toLowerCase()));
    return set.size;
  }, [stakes]);
  const bothSidesStaked = distinctPicksStaked >= 2;

  // Show submission status only when bet is PENDING_RESULT (after expiry)
  const showSubmissionStatus = effectiveStatus === 'PENDING_RESULT';

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

  // Outcome windows are now indefinite - can always submit while PENDING_RESULT
  const canSubmitOutcome =
    !!roomActive &&
    !!roomId &&
    isParticipant &&
    !mySubmission &&
    effectiveStatus === 'PENDING_RESULT';

  const canResolve =
    !!roomId &&
    (((currentUserRole === 'ATTESTOR' || currentUserRole === 'ADMIN') && dbStatus === 'DISPUTED') ||
      (currentUserRole === 'ADMIN' && dbStatus === 'PENDING_RESULT'));

  const canVoid = !!roomId && currentUserRole === 'ADMIN' && dbStatus !== 'VOID';

  // Header subtitle: for SETTLED/VOID we lean on the badge; otherwise show
  // "about <subject>" if the bet has a subject distinct from the creator.
  const subtitle = subjectName
    ? subjectName === offererName
      ? `${offererName}'s offer`
      : `${offererName} · about ${subjectName}`
    : `${offererName}'s offer`;

  // Header section with question - tappable for navigation when canJoin
  const headerContent = (
    <>
      <View className="mb-2 flex-row items-center justify-between gap-2">
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

      <Text className="text-base font-bold leading-5 text-text-primary" numberOfLines={2}>
        {bet.question}
      </Text>
    </>
  );

  return (
    <View
      className={`mb-3 rounded-2xl border border-border bg-surface px-4 py-3 ${dimmed ? 'opacity-60' : ''}`}
    >
      {canJoin && onNavigate ? (
        <TouchableOpacity activeOpacity={0.7} onPress={onNavigate}>
          {headerContent}
        </TouchableOpacity>
      ) : (
        headerContent
      )}

      {options.length > 0 ? (
        <PoolTally
          options={options}
          stakesByPick={stakesByPick}
          winningPick={dbStatus === 'SETTLED' ? bet.outcome : null}
          isSettled={dbStatus === 'SETTLED'}
          currentUserId={currentUserId ?? null}
          getDisplayLabel={getDisplayLabel}
          canJoin={canJoin}
          selectedPick={selectedPick}
          onSelectPick={onSelectPick}
          subjectUserId={bet.subject_user_id}
          subjectPositiveOption={bet.subject_positive_option}
          membershipStatusMap={membershipStatusMap}
        />
      ) : null}

      {showSubmissionStatus ? (
        <View className="mt-2 flex-row items-center gap-3 rounded-xl border border-border bg-surface-light px-3 py-2">
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-text-primary">
              {submittedCount}/{totalParticipants} submitted
            </Text>
            {mySubmission ? (
              <Text className="mt-0.5 text-xs font-medium text-primary" numberOfLines={1}>
                ✓ You reported &ldquo;{getDisplayLabel(mySubmission.selected_option)}&rdquo;
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {dbStatus === 'PENDING_DISPUTE' && bet.preliminary_outcome ? (
        <View className="mt-2 flex-row items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2">
          <Trophy size={20} color={colors.primary} weight="fill" />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-primary">
              Result: {getDisplayLabel(bet.preliminary_outcome)}
            </Text>
            {hasDisputeWindowSet(bet) && getDisputeWindowRemaining(bet, serverNow) > 0 ? (
              <Text className="mt-0.5 text-xs text-text-secondary">
                {getDisputeWindowRemaining(bet, serverNow)}s to dispute
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {showWaitingForClose && isParticipant ? (
        <View className="mt-2 flex-row items-center gap-3 rounded-xl border border-border bg-surface-light px-3 py-2">
          <Timer size={20} color={colors.warning} weight="bold" />
          <Text className="flex-1 text-sm font-medium text-text-secondary">
            Waiting for bet to close before outcomes can be submitted
          </Text>
        </View>
      ) : null}

      <View className="mt-2 flex-row flex-wrap items-center gap-x-2 gap-y-1">
        <Coins size={16} color={colors.chipsIcon} weight="fill" />
        <Text className="text-sm font-medium text-text-secondary">
          {bet.stake} chips · pool {pool}
        </Text>
        {countdown ? (
          <>
            <Timer size={14} color={colors.warning} weight="bold" />
            <Text className="text-sm font-semibold text-warning">{countdown}</Text>
          </>
        ) : null}
        {effectiveStatus === 'PENDING_RESULT' && hasBetExpired ? (
          <>
            <Timer size={14} color={colors.primary} weight="bold" />
            <Text className="text-sm font-semibold text-primary">Awaiting submissions</Text>
          </>
        ) : null}
        {dbStatus === 'PENDING_DISPUTE' ? (
          <>
            <Timer size={14} color={colors.warning} weight="bold" />
            <Text className="text-sm font-semibold text-warning">
              {!hasDisputeWindowSet(bet)
                ? 'Waiting...'
                : disputeWindowRemaining > 0
                  ? `${disputeWindowRemaining}s to dispute`
                  : 'Confirming...'}
            </Text>
          </>
        ) : null}
        {dbStatus === 'SETTLED' && bet.outcome ? (
          currentUserWon ? (
            // User won - show their winnings prominently
            <>
              <Trophy size={14} color={colors.primary} weight="fill" />
              <Text className="text-sm font-semibold text-primary">You won +{perWinnerPayout}</Text>
            </>
          ) : currentUserLost ? (
            // User lost - show their loss clearly
            <>
              <Text className="text-sm font-medium text-error">You lost {bet.stake}</Text>
              <Text className="text-sm text-text-muted">· {getDisplayLabel(bet.outcome)} won</Text>
            </>
          ) : (
            // User didn't participate - show outcome neutrally
            <>
              <Trophy size={14} color={colors.primary} weight="fill" />
              <Text className="text-sm font-semibold text-primary">
                {getDisplayLabel(bet.outcome).toUpperCase()} +{perWinnerPayout}
              </Text>
            </>
          )
        ) : null}
        {dbStatus === 'VOID' ? (
          <>
            <Warning size={14} color={colors.textMuted} weight="fill" />
            <Text className="text-sm text-text-muted">Voided</Text>
          </>
        ) : null}
        {dbStatus === 'DISPUTED' ? (
          <>
            <Warning size={14} color={colors.warning} weight="fill" />
            <Text className="text-sm font-semibold text-warning">Disputed</Text>
          </>
        ) : null}
        <Text className="text-xs text-text-muted">· {formatRelativeActivityTime(timestamp)}</Text>
      </View>

      {/* Action buttons - only one primary action at a time (matches bet details page) */}
      {canJoin ? (
        <SwipeToConfirmButton
          bet={bet}
          selectedPick={selectedPick ?? null}
          displayLabel={selectedPick ? getDisplayLabel(selectedPick) : null}
          onSuccess={onJoinSuccess}
        />
      ) : canSubmitOutcome ? (
        <TouchableOpacity
          onPress={() => setSubmitSheetOpen(true)}
          activeOpacity={0.8}
          className="mt-3 flex-row items-center justify-center gap-2 rounded-xl bg-primary py-3"
        >
          <Check size={18} color="#fff" weight="bold" />
          <Text className="text-sm font-bold text-white">Submit outcome</Text>
        </TouchableOpacity>
      ) : canResolve ? (
        <View className="mt-3">
          <TouchableOpacity
            onPress={() => setDisputeSheetOpen(true)}
            activeOpacity={0.8}
            className="flex-row items-center justify-center gap-2 rounded-xl bg-warning py-3"
          >
            {dbStatus === 'DISPUTED' ? (
              <Warning size={18} color="#FFFFFF" weight="bold" />
            ) : (
              <Check size={18} color="#FFFFFF" weight="bold" />
            )}
            <Text className="text-sm font-bold text-white">
              {dbStatus === 'DISPUTED' ? 'Resolve dispute' : 'Force Resolve'}
            </Text>
          </TouchableOpacity>
          <Text className="mt-1.5 text-center text-[11px] text-text-muted">
            {dbStatus === 'DISPUTED'
              ? 'Conflicting outcomes submitted'
              : `${submittedCount} of ${totalParticipants} submitted · admin override`}
          </Text>
        </View>
      ) : canVoid ? (
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

      {/* Sheets - rendered separately so they work regardless of which button triggered them */}
      {roomId ? (
        <SubmitOutcomeSheet
          visible={submitSheetOpen}
          onClose={() => setSubmitSheetOpen(false)}
          bet={bet}
          roomId={roomId}
          positiveLabel={betTemplate?.positive_label}
          negativeLabel={betTemplate?.negative_label}
        />
      ) : null}

      {roomId ? (
        <ResolveDisputeSheet
          visible={disputeSheetOpen}
          onClose={() => setDisputeSheetOpen(false)}
          bet={bet}
          roomId={roomId}
          positiveLabel={betTemplate?.positive_label}
          negativeLabel={betTemplate?.negative_label}
        />
      ) : null}

      {roomId ? (
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
  const { colors } = useTheme();
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
  isSettled,
  currentUserId,
  getDisplayLabel,
  canJoin,
  selectedPick,
  onSelectPick,
  subjectUserId,
  subjectPositiveOption,
  membershipStatusMap,
}: {
  options: string[];
  stakesByPick: Record<string, BetStakeWithProfile[]>;
  winningPick: string | null;
  isSettled?: boolean;
  currentUserId: string | null;
  getDisplayLabel: (option: string) => string;
  canJoin?: boolean;
  selectedPick?: string | null;
  onSelectPick?: (pick: string) => void;
  subjectUserId?: string | null;
  subjectPositiveOption?: string | null;
  membershipStatusMap?: Map<string, RoomMemberStatus>;
}) {
  if (options.length === 0) return null;

  // Subject user can only pick the positive option (if set)
  const isSubject = !!currentUserId && !!subjectUserId && currentUserId === subjectUserId;

  return (
    <View className="mt-2.5 flex-row items-stretch gap-2">
      {options.map((option, idx) => {
        const list = stakesByPick[option] ?? [];
        const tone = idx === 0 ? 'primary' : 'error';
        const isWinner =
          !!winningPick && option.trim().toLowerCase() === winningPick.trim().toLowerCase();
        const youOnThisSide = !!currentUserId && list.some((s) => s.user_id === currentUserId);
        const isSelected = canJoin && selectedPick === option;
        const isDisabled =
          isSubject && subjectPositiveOption !== null && option !== subjectPositiveOption;
        // User lost if bet is settled, user is on this side, and this side didn't win
        const youLost = !!isSettled && youOnThisSide && !isWinner;

        return (
          <PoolSide
            key={option}
            option={option}
            label={getDisplayLabel(option)}
            count={list.length}
            stakes={list}
            tone={tone}
            isWinner={isWinner}
            youOnThisSide={youOnThisSide}
            youLost={youLost}
            canJoin={canJoin && !isDisabled}
            isSelected={isSelected}
            isDisabled={isDisabled}
            onPress={canJoin && !isDisabled ? onSelectPick : undefined}
            membershipStatusMap={membershipStatusMap}
          />
        );
      })}
    </View>
  );
}

function PoolSide({
  option,
  label,
  count,
  stakes,
  tone,
  isWinner,
  youOnThisSide,
  youLost,
  canJoin,
  isSelected,
  isDisabled,
  onPress,
  membershipStatusMap,
}: {
  option: string;
  label: string;
  count: number;
  stakes: BetStakeWithProfile[];
  tone: 'primary' | 'error';
  isWinner: boolean;
  youOnThisSide: boolean;
  youLost?: boolean;
  canJoin?: boolean;
  isSelected?: boolean;
  isDisabled?: boolean;
  onPress?: (option: string) => void;
  membershipStatusMap?: Map<string, RoomMemberStatus>;
}) {
  const { colors } = useTheme();
  const handlePress = useCallback(() => {
    onPress?.(option);
  }, [onPress, option]);

  // Determine border and background based on state
  // Winner state takes priority over disabled state (for settled bets)
  let borderClass: string;
  let bgClass: string;

  if (isWinner) {
    borderClass = 'border-primary';
    bgClass = 'bg-primary/10';
  } else if (youLost) {
    // User lost on this side - subtle red tint
    borderClass = 'border-error/50';
    bgClass = 'bg-error/10';
  } else if (isDisabled) {
    borderClass = 'border-border';
    bgClass = 'bg-surface-light opacity-40';
  } else if (isSelected) {
    borderClass = tone === 'primary' ? 'border-primary' : 'border-error';
    bgClass = tone === 'primary' ? 'bg-primary/15' : 'bg-error/15';
  } else if (canJoin) {
    // Tappable but not selected - show subtle hint
    borderClass = tone === 'primary' ? 'border-primary/50' : 'border-error/50';
    bgClass = 'bg-surface-light';
  } else {
    borderClass = 'border-border';
    bgClass = 'bg-surface-light';
  }

  // Winner shows primary color, loser shows muted
  const labelClass = isWinner
    ? 'text-primary'
    : youLost
      ? 'text-error/70'
      : isDisabled
        ? 'text-text-muted'
        : tone === 'primary'
          ? 'text-primary'
          : 'text-error';

  const content = (
    <>
      <View className="flex-row items-center justify-between">
        <Text
          className={`text-sm font-bold uppercase tracking-wide ${labelClass}`}
          numberOfLines={1}
        >
          {label}
        </Text>
        {isWinner ? (
          <Trophy size={14} color={colors.primary} weight="fill" />
        ) : youLost ? (
          <X size={14} color={colors.error} weight="bold" />
        ) : isDisabled ? (
          <Lock size={14} color={colors.textMuted} weight="bold" />
        ) : isSelected ? (
          <Check
            size={14}
            color={tone === 'primary' ? colors.primary : colors.error}
            weight="bold"
          />
        ) : null}
      </View>
      <Text className="mt-1 text-xs text-text-secondary">
        {count === 0 ? 'no backers' : count === 1 ? '1 backer' : `${count} backers`}
        {youLost ? ' · you lost' : youOnThisSide ? ' · you' : ''}
      </Text>
      {count > 0 ? <StakeAvatars stakes={stakes} membershipStatusMap={membershipStatusMap} /> : null}
      {canJoin && !isDisabled && !isSelected ? (
        <Text className={`mt-2 text-center text-[10px] font-bold uppercase ${labelClass}`}>
          Tap to select
        </Text>
      ) : null}
    </>
  );

  if (canJoin && !isDisabled) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        className={`min-w-0 flex-1 rounded-xl border-2 ${borderClass} ${bgClass} px-3 py-2`}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View className={`min-w-0 flex-1 rounded-xl border-2 ${borderClass} ${bgClass} px-3 py-2`}>
      {content}
    </View>
  );
}

function StakeAvatars({
  stakes,
  membershipStatusMap,
}: {
  stakes: BetStakeWithProfile[];
  membershipStatusMap?: Map<string, RoomMemberStatus>;
}) {
  const shown = stakes.slice(0, 3);
  const overflow = stakes.length - shown.length;
  return (
    <View className="mt-2 flex-row items-center">
      {shown.map((stake, idx) => {
        const status = membershipStatusMap?.get(stake.user_id);
        const isInactive = isMemberInactive(status);
        return (
          <View
            key={stake.id}
            className={`rounded-full border-2 border-surface ${idx > 0 ? '-ml-2' : ''}`}
            style={{ zIndex: 10 - idx }}
          >
            <Avatar
              uri={stake.user?.avatar_url}
              fallback={stake.user?.display_name ?? '?'}
              size="sm"
              inactive={isInactive}
            />
          </View>
        );
      })}
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
  /** Membership status lookup for showing left/removed indicators */
  membershipStatusMap?: Map<string, RoomMemberStatus>;
}

export function ActivityFeedItem({
  item,
  currentUserId,
  currentUserRole,
  roomActive,
  roomId,
  currentUserBalance,
  membershipStatusMap,
}: ActivityFeedItemProps) {
  if (item.type === 'bet') {
    return (
      <BetActivityFeedItem
        item={item}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        roomActive={roomActive}
        roomId={roomId}
        membershipStatusMap={membershipStatusMap}
      />
    );
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

function BetActivityFeedItem({
  item,
  currentUserId,
  currentUserRole,
  roomActive,
  roomId,
  membershipStatusMap,
}: {
  item: Extract<ActivityItem, { type: 'bet' }>;
  currentUserId?: string | null;
  currentUserRole?: 'PLAYER' | 'ATTESTOR' | 'ADMIN' | string | null;
  roomActive?: boolean;
  roomId?: string;
  membershipStatusMap?: Map<string, RoomMemberStatus>;
}) {
  const router = useRouter();
  const [selectedPick, setSelectedPick] = useState<string | null>(null);

  const stakes = item.bet.stakes ?? [];
  const alreadyStaked = !!currentUserId && stakes.some((s) => s.user_id === currentUserId);
  const canJoin =
    roomActive &&
    !!roomId &&
    !!currentUserId &&
    (item.bet.status === 'OPEN' || item.bet.status === 'MATCHED') &&
    !alreadyStaked &&
    getEffectiveBetStatus(item.bet) !== 'EXPIRED';

  const handleBetPress = useCallback(() => {
    router.push(`/(tabs)/rooms/bet/${item.bet.id}`);
  }, [router, item.bet.id]);

  const handleSelectPick = useCallback((pick: string) => {
    setSelectedPick((prev) => (prev === pick ? null : pick));
  }, []);

  const handleJoinSuccess = useCallback(() => {
    setSelectedPick(null);
  }, []);

  // When user can join, we use a View wrapper to prevent accidental navigation
  // The card content has a separate tap area for navigation (header)
  if (canJoin) {
    return (
      <BetActivityCard
        bet={item.bet}
        timestamp={item.timestamp}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        roomActive={roomActive}
        roomId={roomId}
        canJoin={canJoin}
        selectedPick={selectedPick}
        onSelectPick={handleSelectPick}
        onJoinSuccess={handleJoinSuccess}
        onNavigate={handleBetPress}
        membershipStatusMap={membershipStatusMap}
      />
    );
  }

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={handleBetPress}>
      <BetActivityCard
        bet={item.bet}
        timestamp={item.timestamp}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        roomActive={roomActive}
        roomId={roomId}
        membershipStatusMap={membershipStatusMap}
      />
    </TouchableOpacity>
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
  const { colors } = useTheme();
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

  const canCancel = !!roomActive && isRequester && status === 'OPEN' && !!roomId;

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
            <Text className="text-base font-semibold text-text-primary" numberOfLines={1}>
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
            <Text className="text-sm font-semibold text-text-primary">
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
          <HandCoins size={18} color="#FFFFFF" weight="bold" />
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
