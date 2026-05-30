import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Check,
  Clock,
  Coins,
  Crown,
  Gavel,
  Prohibit,
  Timer,
  Trophy,
  Warning,
  X,
} from 'phosphor-react-native';
import { useQueryClient } from '@tanstack/react-query';

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { LockedInCelebration } from '@/components/activity/locked-in-celebration';
import { ResolveDisputeSheet } from '@/components/activity/resolve-dispute-sheet';
import { SubmitOutcomeSheet } from '@/components/activity/submit-outcome-sheet';
import { VoidBetSheet } from '@/components/activity/void-bet-sheet';
import { WinnerCelebration } from '@/components/activity/winner-celebration';
import { useFeedback } from '@/providers/feedback';
import { useServerTimeTick } from '@/providers/time';
import { betDetailKey, roomBalanceKey, useBetDetail, type BetStakeWithProfile } from '@/hooks/use-activity-feed';
import { useRoomDetail, useRoomMembers, getRpcErrorMessage } from '@/hooks/use-rooms';
import { useJoinBet } from '@/hooks/use-join-bet';
import { useProcessExpiredBet } from '@/hooks/use-process-expired-bet';
import { useQuestionTemplates } from '@/hooks/use-question-templates';
import { useAuth } from '@/providers/auth';
import { formatBetCountdown, formatRelativeActivityTime, parseApiTimestamp } from '@/lib/date-format';
import {
  getEffectiveBetStatus,
  getOutcomeWindowRemaining,
  getDisputeWindowRemaining,
  isInDisputeWindow,
  hasOutcomeWindowSet,
  hasDisputeWindowSet,
  isBetPastExpiry,
} from '@/lib/effective-bet-status';
import { useRaiseDispute } from '@/hooks/use-raise-dispute';
import {
  useProcessOutcomeWindow,
  useProcessDisputeWindow,
} from '@/hooks/use-process-settlement-windows';
import { markBetCelebrated, hasBetBeenCelebrated } from '@/hooks/use-winner-celebration';
import { supabase } from '@/lib/supabase';

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

function formatStakeChips(stake: number): string {
  return `${stake.toLocaleString('en-US')} chips`;
}

export default function BetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const safeInsets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;

  const { data: bet, isLoading } = useBetDetail(id ?? '');
  const { data: room } = useRoomDetail(bet?.room_id ?? '');
  const { data: members } = useRoomMembers(bet?.room_id ?? '');
  const { data: templates } = useQuestionTemplates('golf');
  const joinBet = useJoinBet();
  const processExpiredBet = useProcessExpiredBet();
  const raiseDispute = useRaiseDispute();
  const processOutcomeWindow = useProcessOutcomeWindow();
  const processDisputeWindow = useProcessDisputeWindow();

  // Track if we've already triggered processing for this bet
  const processedBetRef = useRef<string | null>(null);
  const outcomeProcessedRef = useRef<string | null>(null);
  const disputeProcessedRef = useRef<string | null>(null);

  // Get template for contextual labels (Hit/Miss, Make/Miss, etc.)
  const betTemplate = useMemo(() => {
    if (!bet?.template_id || !templates) return null;
    return templates.find((t) => t.id === bet.template_id) ?? null;
  }, [bet?.template_id, templates]);

  // Map raw option (Yes/No) to contextual display label
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

  const serverNow = useServerTimeTick();
  const [submitSheetOpen, setSubmitSheetOpen] = useState(false);
  const [disputeSheetOpen, setDisputeSheetOpen] = useState(false);
  const [voidSheetOpen, setVoidSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showWinCelebration, setShowWinCelebration] = useState(false);
  const [showLockedInCelebration, setShowLockedInCelebration] = useState(false);
  const { trigger } = useFeedback();

  const dbStatus = bet?.status ?? '';
  const prevStatusRef = useRef<string | null>(null);

  // Detect status transitions and trigger celebrations
  useEffect(() => {
    if (!bet || isLoading) return;

    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = dbStatus;

    // Skip on initial load (prevStatus is null)
    if (prevStatus === null) return;

    const userParticipated =
      currentUserId && (bet.stakes ?? []).some((s) => s.user_id === currentUserId);

    // OPEN → MATCHED: "You're locked in" celebration
    if (prevStatus === 'OPEN' && dbStatus === 'MATCHED' && userParticipated) {
      setShowLockedInCelebration(true);
      trigger('bet_matched');
    }

    // → SETTLED: Win/loss celebration (only if not already celebrated elsewhere)
    if (prevStatus !== 'SETTLED' && dbStatus === 'SETTLED' && !hasBetBeenCelebrated(bet.id)) {
      const userWon =
        currentUserId &&
        bet.outcome &&
        (bet.stakes ?? []).some(
          (s) =>
            s.user_id === currentUserId &&
            s.pick.trim().toLowerCase() === bet.outcome!.trim().toLowerCase(),
        );

      // Mark as celebrated globally to prevent duplicate celebrations
      markBetCelebrated(bet.id);

      if (userWon) {
        setShowWinCelebration(true);
        trigger('bet_won');
      } else if (userParticipated) {
        trigger('bet_lost');
      }
    }
  }, [bet, dbStatus, isLoading, currentUserId, trigger]);

  // Auto-process expired bets immediately (eliminates 0-60s cron lag)
  // Handles client/server clock skew by retrying until server processes the bet
  useEffect(() => {
    if (!bet || isLoading || !bet.room_id) return;
    if (processExpiredBet.isPending) return;
    // Process both OPEN and MATCHED bets when they expire
    if (dbStatus !== 'OPEN' && dbStatus !== 'MATCHED') return;
    if (!bet.expires_at) return;

    // Client-side expiry check using server-synced time
    const expiresAt = new Date(bet.expires_at);
    if (expiresAt > serverNow) return;

    // Don't call RPC again if we're already waiting for retry
    if (processedBetRef.current === bet.id) return;

    const roomId = bet.room_id;
    const betId = bet.id;

    (async () => {
      try {
        const result = await processExpiredBet.mutateAsync({ betId, roomId });

        // Check if RPC actually processed the bet (status changed from OPEN/MATCHED)
        if (result.status === 'OPEN' || result.status === 'MATCHED') {
          // Server clock hasn't reached expiry yet - schedule retry
          setTimeout(() => {
            processedBetRef.current = null; // Allow retry
            // Trigger re-render to retry
            queryClient.invalidateQueries({ queryKey: betDetailKey(betId) });
          }, 3000); // Retry in 3 seconds
          processedBetRef.current = betId; // Prevent immediate re-call
        } else {
          // Successfully processed - mark as done and refetch
          processedBetRef.current = betId;
          await Promise.all([
            queryClient.refetchQueries({ queryKey: betDetailKey(betId) }),
            queryClient.refetchQueries({ queryKey: roomBalanceKey(roomId) }),
          ]);
        }
      } catch {
        processedBetRef.current = null;
      }
    })();
  }, [bet, dbStatus, isLoading, processExpiredBet, queryClient, serverNow]);


  // Auto-process outcome window when it expires (eliminates cron delay)
  useEffect(() => {
    if (dbStatus !== 'PENDING_RESULT' || !bet?.id || !bet?.room_id) return;
    if (processOutcomeWindow.isPending) return; // Already processing
    if (outcomeProcessedRef.current === bet.id) return; // Already processed this bet

    // CRITICAL: Only process if outcome_window_ends_at is set and expired
    // If NULL, the server hasn't set it yet - let the cron handle it
    if (!bet.outcome_window_ends_at) return;

    const remaining = getOutcomeWindowRemaining(bet, room?.outcome_submission_window_seconds ?? 30);
    if (remaining > 0) return; // Window still open

    outcomeProcessedRef.current = bet.id;
    processOutcomeWindow.mutate(
      { p_bet_id: bet.id, roomId: bet.room_id },
      {
        onError: () => {
          outcomeProcessedRef.current = null;
        },
      },
    );
  }, [dbStatus, bet?.id, bet?.room_id, bet?.outcome_window_ends_at, serverNow, processOutcomeWindow.isPending]);

  // Auto-process dispute window when it expires (eliminates cron delay)
  useEffect(() => {
    if (dbStatus !== 'PENDING_DISPUTE' || !bet?.id || !bet?.room_id) return;
    if (processDisputeWindow.isPending) return; // Already processing
    if (disputeProcessedRef.current === bet.id) return; // Already processed this bet

    // IMPORTANT: Only process if dispute_window_ends_at is set and expired
    // If it's null, the server hasn't set it yet - wait for refetch
    if (!bet.dispute_window_ends_at) return;

    const remaining = getDisputeWindowRemaining(bet);
    if (remaining > 0) return; // Window still open

    // Window expired, trigger processing
    disputeProcessedRef.current = bet.id;
    processDisputeWindow.mutate({ p_bet_id: bet.id, roomId: bet.room_id });
  }, [dbStatus, bet?.id, bet?.room_id, bet?.dispute_window_ends_at, serverNow, processDisputeWindow.isPending]);

  // Realtime subscription for bet updates
  useEffect(() => {
    if (!id || !bet?.room_id) return;

    const roomId = bet.room_id;

    // Unique token prevents reusing an already-subscribed channel on re-mount
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const channel = supabase
      .channel(`bet-detail:${id}:${token}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bets', filter: `id=eq.${id}` },
        () => {
          // Force immediate refetch for bet status changes
          void queryClient.refetchQueries({ queryKey: betDetailKey(id) });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bet_stakes', filter: `bet_id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: betDetailKey(id) }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'outcome_submissions', filter: `bet_id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: betDetailKey(id) }),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ledger_entries', filter: `bet_id=eq.${id}` },
        () => {
          // Force immediate balance refetch when ledger entries are added (refunds, wins)
          void queryClient.refetchQueries({ queryKey: roomBalanceKey(roomId) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, bet?.room_id, queryClient]);

  const effectiveStatus = useMemo(
    () => (bet ? getEffectiveBetStatus(bet, serverNow) : ''),
    [bet, serverNow],
  );

  // Check if bet has actually expired (expires_at <= now)
  // Used to delay showing outcome countdown until expiry, even if server processed early
  // Use parseApiTimestamp to handle timestamps without timezone (treats as UTC)
  const hasBetExpired = useMemo(() => {
    if (!bet?.expires_at) return false;
    const expiresAt = parseApiTimestamp(bet.expires_at);
    if (!expiresAt) return false;
    return expiresAt <= serverNow;
  }, [bet?.expires_at, serverNow]);

  const options = useMemo(() => {
    if (!bet) return [] as string[];
    const raw = Array.isArray(bet.options) ? (bet.options as unknown[]) : [];
    return raw.filter((o): o is string => typeof o === 'string' && o.trim().length > 0);
  }, [bet]);

  const stakes = useMemo(() => bet?.stakes ?? [], [bet]);
  const stakesByPick = useMemo(() => groupStakesByPick(options, stakes), [options, stakes]);

  const pool = stakes.length * (bet?.stake ?? 0);
  const pill = getBetStatusPill(effectiveStatus);
  const dimmed = effectiveStatus === 'EXPIRED' || effectiveStatus === 'VOID';

  const subjectName = bet?.subject_profile?.display_name ?? null;
  const offererName = bet?.offered_by_profile?.display_name ?? 'Someone';

  // Show countdown for OPEN and MATCHED bets that haven't expired yet
  // (MATCHED means someone joined but not all members, so still waiting for expiry)
  const countdown =
    (effectiveStatus === 'OPEN' || effectiveStatus === 'MATCHED') && !hasBetExpired
      ? formatBetCountdown(bet?.expires_at, serverNow)
      : null;

  // Winners calculation
  const winningStakes = useMemo(() => {
    if (dbStatus !== 'SETTLED' || !bet?.outcome) return [] as BetStakeWithProfile[];
    const outcome = bet.outcome.trim().toLowerCase();
    return stakes.filter((s) => s.pick.trim().toLowerCase() === outcome);
  }, [dbStatus, bet?.outcome, stakes]);

  const perWinnerPayout = winningStakes.length > 0 ? Math.floor(pool / winningStakes.length) : 0;
  const currentUserWon = !!currentUserId && winningStakes.some((s) => s.user_id === currentUserId);

  // Current user's stake
  const myStake = useMemo(
    () => stakes.find((s) => s.user_id === currentUserId) ?? null,
    [stakes, currentUserId],
  );
  const currentUserLost = dbStatus === 'SETTLED' && !!myStake && !currentUserWon;

  // Outcome submissions
  const outcomeSubmissions = useMemo(
    () => bet?.outcome_submissions ?? [],
    [bet?.outcome_submissions],
  );
  const submittedCount = outcomeSubmissions.length;
  const totalParticipants = stakes.length;
  const mySubmission = useMemo(
    () =>
      currentUserId ? (outcomeSubmissions.find((s) => s.user_id === currentUserId) ?? null) : null,
    [outcomeSubmissions, currentUserId],
  );

  // Participants who haven't submitted yet
  const pendingParticipants = useMemo(() => {
    const submittedUserIds = new Set(outcomeSubmissions.map((s) => s.user_id));
    return stakes
      .filter((s) => !submittedUserIds.has(s.user_id))
      .map((s) => ({
        user_id: s.user_id,
        display_name: s.user?.display_name ?? 'Unknown',
      }));
  }, [stakes, outcomeSubmissions]);

  // Group submissions by option for attestor view
  const submissionsByOption = useMemo(() => {
    const grouped: Record<string, typeof outcomeSubmissions> = {};
    for (const option of options) {
      grouped[option] = outcomeSubmissions.filter(
        (s) => s.selected_option.trim().toLowerCase() === option.trim().toLowerCase(),
      );
    }
    return grouped;
  }, [options, outcomeSubmissions]);

  // Check if both sides are staked
  const distinctPicksStaked = useMemo(() => {
    const set = new Set(stakes.map((s) => s.pick.trim().toLowerCase()));
    return set.size;
  }, [stakes]);
  const bothSidesStaked = distinctPicksStaked >= 2;

  // Current user's role
  const currentMember = members?.find((m) => m.user_id === currentUserId);
  const currentUserRole = currentMember?.role ?? null;
  const isAttestorOrAdmin = currentUserRole === 'ATTESTOR' || currentUserRole === 'ADMIN';
  const isActive = room?.is_active ?? false;

  // Can join?
  const alreadyStaked = !!myStake;
  const canJoin =
    isActive &&
    !!bet?.room_id &&
    !!currentUserId &&
    (bet?.status === 'OPEN' || bet?.status === 'MATCHED') &&
    !alreadyStaked &&
    effectiveStatus !== 'EXPIRED';

  // Can submit outcome? Use effectiveStatus for immediate client-side detection
  // Check if window has expired (using client-side calculation if outcome_window_ends_at not set)
  const isParticipant = !!myStake;
  const outcomeWindowSeconds = room?.outcome_submission_window_seconds ?? 30;
  const outcomeWindowExpired =
    !!bet && hasOutcomeWindowSet(bet) && getOutcomeWindowRemaining(bet, outcomeWindowSeconds) <= 0;
  const canSubmitOutcome =
    isActive &&
    isParticipant &&
    !mySubmission &&
    effectiveStatus === 'PENDING_RESULT' &&
    !outcomeWindowExpired;

  // Can resolve? Only DISPUTED bets need manual resolution by attestor/admin
  // PENDING_RESULT and PENDING_DISPUTE are handled automatically by timed windows
  const allSubmitted = totalParticipants > 0 && submittedCount === totalParticipants;
  const canResolve = isAttestorOrAdmin && dbStatus === 'DISPUTED';

  // Can void?
  const canVoid = currentUserRole === 'ADMIN' && dbStatus !== 'VOID';

  // Can raise dispute? (participant only, during PENDING_DISPUTE window)
  const canRaiseDispute =
    isActive && isParticipant && dbStatus === 'PENDING_DISPUTE' && !!bet && isInDisputeWindow(bet);

  // Find user's submission in a stake
  const getUserSubmission = useCallback(
    (userId: string) => outcomeSubmissions.find((s) => s.user_id === userId),
    [outcomeSubmissions],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: betDetailKey(id ?? '') });
    setRefreshing(false);
  }, [id, queryClient]);

  const handleJoinBet = useCallback(
    (option: string) => {
      if (!bet?.room_id) return;
      Alert.alert(
        'Join this bet?',
        `You'll back "${getDisplayLabel(option)}" for ${bet.stake.toLocaleString('en-US')} chips.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Lock In',
            style: 'default',
            onPress: async () => {
              try {
                await joinBet.mutateAsync({
                  p_bet_id: bet.id,
                  p_pick: option,
                  roomId: bet.room_id!,
                });
              } catch (err) {
                Alert.alert('Could not join bet', getRpcErrorMessage(err, 'Please try again.'));
              }
            },
          },
        ],
      );
    },
    [bet, joinBet, getDisplayLabel],
  );

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!bet) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-lg text-text-secondary">Bet not found</Text>
      </View>
    );
  }

  const voidLog = bet.void_logs?.[0] ?? null;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Bet Details" showBack showHome />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: safeInsets.bottom + 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* WIN BANNER */}
        {currentUserWon && (
          <View className="mx-4 mt-4 items-center rounded-2xl bg-primary px-6 py-5">
            <Crown size={32} color="#fff" weight="fill" />
            <Text className="mt-1 text-xl font-black text-white">YOU WON!</Text>
            <Text className="text-3xl font-black text-white">
              +{perWinnerPayout.toLocaleString('en-US')}
            </Text>
          </View>
        )}

        {/* LOSS BANNER */}
        {currentUserLost && (
          <View className="mx-4 mt-4 flex-row items-center gap-3 rounded-2xl bg-error/10 px-4 py-4">
            <X size={24} color={colors.error} weight="bold" />
            <View>
              <Text className="text-base font-bold text-error">Better luck next time</Text>
              <Text className="text-sm text-text-secondary">
                Lost {bet.stake.toLocaleString('en-US')} chips
              </Text>
            </View>
          </View>
        )}

        {/* MAIN CARD - Question + Status + Info */}
        <View
          className={`mx-4 mt-4 rounded-2xl border border-border bg-surface p-4 ${dimmed ? 'opacity-60' : ''}`}
        >
          {/* Status + Time */}
          <View className="flex-row items-center justify-between">
            <Badge variant={pill.variant} label={pill.label} />
            <Text className="text-xs text-text-muted">
              {formatRelativeActivityTime(bet.created_at ?? '')}
            </Text>
          </View>

          {/* Question */}
          <Text className="mt-3 text-lg font-bold leading-6 text-white">{bet.question}</Text>

          <Text className="mt-1 text-sm text-text-secondary">
            {subjectName
              ? subjectName === offererName
                ? `${offererName}'s offer`
                : `${offererName} · about ${subjectName}`
              : `${offererName}'s offer`}
          </Text>

          {/* Countdown for OPEN/MATCHED bets */}
          {countdown && (
            <View className="mt-3 flex-row items-center gap-2">
              <Timer size={18} color={colors.warning} weight="bold" />
              <Text className="text-base font-bold text-warning">{countdown}</Text>
            </View>
          )}

          {/* Divider */}
          <View className="my-4 h-px bg-border" />

          {/* Stake & Pool inline */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Coins size={18} color={colors.chipsIcon} weight="fill" />
              <Text className="text-sm text-text-secondary">Entry</Text>
              <Text className="font-bold text-white">{bet.stake.toLocaleString('en-US')}</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Trophy size={18} color={colors.primary} weight="fill" />
              <Text className="text-sm text-text-secondary">Pool</Text>
              <Text className="font-bold text-primary">{pool.toLocaleString('en-US')}</Text>
            </View>
          </View>

          {/* Your Pick */}
          {myStake && dbStatus !== 'SETTLED' && (
            <View className="mt-3 flex-row items-center gap-2">
              <Check size={16} color={colors.primary} weight="bold" />
              <Text className="text-sm font-medium text-primary">
                Your pick: {getDisplayLabel(myStake.pick)}
                {bothSidesStaked && dbStatus !== 'VOID' && (
                  <Text className="text-primary/70">
                    {' '}
                    · Win{' '}
                    {Math.floor(pool / (stakesByPick[myStake.pick]?.length || 1)).toLocaleString(
                      'en-US',
                    )}
                  </Text>
                )}
              </Text>
            </View>
          )}

          {/* Settled Result */}
          {dbStatus === 'SETTLED' && bet.outcome && (
            <View className="mt-3 flex-row items-center gap-2">
              <Trophy size={16} color={colors.primary} weight="fill" />
              <Text className="text-sm font-medium text-primary">
                Result: {getDisplayLabel(bet.outcome)}
                {bet.settlement_method && (
                  <Text className="text-text-muted">
                    {' '}
                    · via {bet.settlement_method.toLowerCase()}
                  </Text>
                )}
              </Text>
            </View>
          )}

          {/* Void Info */}
          {dbStatus === 'VOID' && (
            <View className="mt-3">
              <View className="flex-row items-center gap-2">
                <Prohibit size={16} color={colors.textMuted} weight="fill" />
                <Text className="text-sm font-medium text-text-muted">
                  {voidLog?.voided_by_profile?.display_name
                    ? `Voided by ${voidLog.voided_by_profile.display_name}`
                    : 'Bet Voided'}
                </Text>
              </View>
              {voidLog?.reason && (
                <Text className="mt-1 text-sm italic text-text-muted">
                  &ldquo;{voidLog.reason}&rdquo;
                </Text>
              )}
            </View>
          )}
        </View>

        {/* DISPUTED Alert */}
        {dbStatus === 'DISPUTED' && (
          <View className="mx-4 mt-3 flex-row items-start gap-3 rounded-xl bg-warning/10 px-4 py-3">
            <Warning size={20} color={colors.warning} weight="fill" />
            <View className="flex-1">
              <Text className="font-bold text-warning">
                {isAttestorOrAdmin ? 'Resolution Required' : 'Disputed'}
              </Text>
              <Text className="mt-0.5 text-sm text-text-secondary">
                {isAttestorOrAdmin
                  ? 'Participants disagree. Review votes below and resolve.'
                  : 'An attestor will resolve this dispute.'}
              </Text>
            </View>
          </View>
        )}

        {/* PENDING_RESULT - Submission Progress */}
        {dbStatus === 'PENDING_RESULT' && (
          <View className="mx-4 mt-3 rounded-xl bg-surface px-4 py-3">
            {/* Header row */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Text className="text-sm text-text-secondary">Submissions</Text>
                <Text className="font-bold text-primary">
                  {submittedCount}/{totalParticipants}
                </Text>
              </View>
              {mySubmission ? (
                <View className="flex-row items-center gap-1">
                  <Check size={14} color={colors.primary} weight="bold" />
                  <Text className="text-sm text-primary">
                    {getDisplayLabel(mySubmission.selected_option)}
                  </Text>
                </View>
              ) : isParticipant ? (
                <Text className="text-sm text-warning">Submit your outcome</Text>
              ) : null}
            </View>

            {/* Outcome window countdown - only show once bet has actually expired */}
            {hasBetExpired && hasOutcomeWindowSet(bet) && getOutcomeWindowRemaining(bet, outcomeWindowSeconds) > 0 && (
              <View className="mt-2 flex-row items-center gap-2">
                <Timer size={16} color={colors.warning} weight="bold" />
                <Text className="text-sm font-bold text-warning">
                  {getOutcomeWindowRemaining(bet, outcomeWindowSeconds)}s to submit
                </Text>
              </View>
            )}

            {/* Show who's waiting */}
            {pendingParticipants.length > 0 && (
              <Text className="mt-2 text-xs text-text-muted">
                Waiting for {pendingParticipants.map((p) => p.display_name).join(', ')}
              </Text>
            )}
          </View>
        )}

        {/* PENDING_DISPUTE - Preliminary Result Confirmation */}
        {dbStatus === 'PENDING_DISPUTE' && (
          <View className="mx-4 mt-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
            <View className="flex-row items-center gap-2">
              <Trophy size={20} color={colors.primary} weight="fill" />
              <View className="flex-1">
                <Text className="text-base font-bold text-primary">
                  Result: {bet.preliminary_outcome ? getDisplayLabel(bet.preliminary_outcome) : 'TBD'}
                </Text>
                {hasDisputeWindowSet(bet) && getDisputeWindowRemaining(bet) > 0 && (
                  <Text className="mt-1 text-sm text-text-secondary">
                    {getDisputeWindowRemaining(bet)}s to dispute
                  </Text>
                )}
              </View>
            </View>
            {isParticipant && !mySubmission && (
              <Text className="mt-2 text-xs text-text-muted">
                You can dispute if you disagree with this result.
              </Text>
            )}
          </View>
        )}

        {/* PARTICIPANTS - Side by Side */}
        <View className={`mx-4 mt-4 flex-row gap-3 ${dimmed ? 'opacity-60' : ''}`}>
          {options.map((option, idx) => {
            const optionStakes = stakesByPick[option] ?? [];
            const isWinner =
              !!bet.outcome && option.trim().toLowerCase() === bet.outcome.trim().toLowerCase();
            const isLosingOption = dbStatus === 'SETTLED' && !!bet.outcome && !isWinner;
            const submissions = submissionsByOption[option] ?? [];
            const voteCount = submissions.length;
            const isLeft = idx === 0;
            const canTapToJoin = canJoin && !joinBet.isPending;

            const CardWrapper = canTapToJoin ? TouchableOpacity : View;
            const cardProps = canTapToJoin
              ? {
                  onPress: () => handleJoinBet(option),
                  activeOpacity: 0.7,
                  disabled: joinBet.isPending,
                }
              : {};

            return (
              <CardWrapper
                key={option}
                {...cardProps}
                className={`flex-1 rounded-2xl border bg-surface p-3 ${
                  isWinner
                    ? 'border-primary'
                    : isLosingOption
                      ? 'border-border opacity-60'
                      : canTapToJoin
                        ? `border-2 ${isLeft ? 'border-primary' : 'border-error'}`
                        : 'border-border'
                }`}
              >
                {/* Option Header */}
                <View className={`mb-3 items-center ${isLeft ? '' : ''}`}>
                  <Text
                    className={`text-base font-bold uppercase ${
                      isWinner
                        ? 'text-primary'
                        : isLosingOption
                          ? 'text-text-muted'
                          : isLeft
                            ? 'text-primary'
                            : 'text-error'
                    }`}
                  >
                    {getDisplayLabel(option)}
                  </Text>
                  {isWinner && (
                    <View className="mt-1 flex-row items-center gap-1">
                      <Trophy size={12} color={colors.primary} weight="fill" />
                      <Text className="text-xs font-bold text-primary">WINNER</Text>
                    </View>
                  )}
                  {dbStatus === 'DISPUTED' && voteCount > 0 && (
                    <Text className="mt-1 text-xs text-text-muted">
                      {voteCount} vote{voteCount !== 1 ? 's' : ''}
                    </Text>
                  )}
                </View>

                {/* Participants List */}
                {optionStakes.length > 0 ? (
                  <View className="gap-2">
                    {optionStakes.map((stake) => {
                      const submission = getUserSubmission(stake.user_id);
                      const isCurrentUser = stake.user_id === currentUserId;

                      return (
                        <View key={stake.id} className="items-center">
                          <Avatar
                            uri={stake.user?.avatar_url}
                            fallback={stake.user?.display_name ?? '?'}
                            size="md"
                          />
                          <Text
                            className={`mt-1 text-center text-xs font-medium ${isCurrentUser ? 'text-primary' : 'text-white'}`}
                            numberOfLines={1}
                          >
                            {stake.user?.display_name ?? 'Unknown'}
                            {isCurrentUser ? ' (you)' : ''}
                          </Text>
                          {/* Payout for winners */}
                          {isWinner && dbStatus === 'SETTLED' && (
                            <Text className="text-xs font-bold text-primary">
                              +{perWinnerPayout.toLocaleString('en-US')}
                            </Text>
                          )}
                          {/* Submission status for all participants */}
                          {dbStatus === 'PENDING_RESULT' && (
                            <View className="mt-0.5 flex-row items-center gap-1">
                              {submission ? (
                                <Check size={12} color={colors.primary} weight="bold" />
                              ) : (
                                <Clock size={12} color={colors.textMuted} weight="regular" />
                              )}
                              <Text
                                className={`text-xs ${submission ? 'text-primary' : 'text-text-muted'}`}
                              >
                                {submission ? 'Submitted' : 'Pending'}
                              </Text>
                            </View>
                          )}
                          {/* Detailed submission view for attestors only */}
                          {isAttestorOrAdmin && dbStatus === 'PENDING_RESULT' && submission && (
                            <Text className="text-xs text-text-muted">
                              → {getDisplayLabel(submission.selected_option)}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View className="items-center py-4">
                    <Text className="text-xs text-text-muted">No backers yet</Text>
                  </View>
                )}

                {/* Tap to join hint */}
                {canTapToJoin && (
                  <View className="mt-2 items-center rounded-lg bg-surface-light py-1.5">
                    <Text className={`text-xs font-bold ${isLeft ? 'text-primary' : 'text-error'}`}>
                      Tap to back {getDisplayLabel(option)}
                    </Text>
                  </View>
                )}
              </CardWrapper>
            );
          })}
        </View>

        {/* Status hint for OPEN bets */}
        {dbStatus === 'OPEN' && isParticipant && (
          <View className="mx-4 mb-4 flex-row items-center gap-2">
            {!bothSidesStaked ? (
              <Text className="text-sm text-text-muted">
                Waiting for someone to take the other side.
              </Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Bottom Actions */}
      <View
        className="absolute bottom-0 left-0 right-0 border-t border-border bg-background px-6 pt-4"
        style={{ paddingBottom: Math.max(safeInsets.bottom, 16) }}
      >
        {canJoin ? (
          <View className="items-center rounded-xl bg-primary/10 py-4">
            <Text className="text-base font-semibold text-primary">
              {joinBet.isPending
                ? 'Joining...'
                : `Pick a side above · ${formatStakeChips(bet.stake)}`}
            </Text>
          </View>
        ) : canSubmitOutcome ? (
          <Button onPress={() => setSubmitSheetOpen(true)} size="lg">
            Submit Outcome
          </Button>
        ) : canRaiseDispute ? (
          <TouchableOpacity
            onPress={() => {
              if (!bet.room_id) return;
              Alert.alert(
                'Raise Dispute?',
                'This will flag the preliminary result for admin review. Only do this if you believe the result is incorrect.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Raise Dispute',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await raiseDispute.mutateAsync({
                          p_bet_id: bet.id,
                          roomId: bet.room_id!,
                        });
                      } catch (err) {
                        Alert.alert('Could not raise dispute', getRpcErrorMessage(err, 'Please try again.'));
                      }
                    },
                  },
                ],
              );
            }}
            activeOpacity={0.8}
            disabled={raiseDispute.isPending}
            className="flex-row items-center justify-center gap-2 rounded-xl bg-warning py-4"
          >
            <Warning size={20} color="#fff" weight="bold" />
            <Text className="text-base font-bold text-white">
              {raiseDispute.isPending ? 'Raising Dispute...' : 'Raise Dispute'}
            </Text>
          </TouchableOpacity>
        ) : canResolve ? (
          <TouchableOpacity
            onPress={() => setDisputeSheetOpen(true)}
            activeOpacity={0.8}
            className={`flex-row items-center justify-center gap-2 rounded-xl py-4 ${
              dbStatus === 'DISPUTED' ? 'bg-warning' : 'bg-primary'
            }`}
          >
            {dbStatus === 'DISPUTED' ? (
              <Gavel size={20} color="#fff" weight="bold" />
            ) : (
              <Check size={20} color="#fff" weight="bold" />
            )}
            <Text className="text-base font-bold text-white">
              {dbStatus === 'DISPUTED' ? 'Resolve Dispute' : 'Finalize Result'}
            </Text>
          </TouchableOpacity>
        ) : canVoid ? (
          <TouchableOpacity
            onPress={() => setVoidSheetOpen(true)}
            activeOpacity={0.8}
            className="flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface-light py-4"
          >
            <Prohibit size={18} color={colors.textMuted} weight="bold" />
            <Text className="text-base font-bold text-text-muted">Void Bet</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Sheets */}
      {canSubmitOutcome && bet.room_id && (
        <SubmitOutcomeSheet
          visible={submitSheetOpen}
          onClose={() => setSubmitSheetOpen(false)}
          bet={bet}
          roomId={bet.room_id}
          positiveLabel={betTemplate?.positive_label}
          negativeLabel={betTemplate?.negative_label}
        />
      )}

      {canResolve && bet.room_id && (
        <ResolveDisputeSheet
          visible={disputeSheetOpen}
          onClose={() => setDisputeSheetOpen(false)}
          bet={bet}
          roomId={bet.room_id}
          positiveLabel={betTemplate?.positive_label}
          negativeLabel={betTemplate?.negative_label}
        />
      )}

      {canVoid && bet.room_id && (
        <VoidBetSheet
          visible={voidSheetOpen}
          onClose={() => setVoidSheetOpen(false)}
          bet={bet}
          roomId={bet.room_id}
        />
      )}

      {/* Locked-in celebration - shows on OPEN → MATCHED transition */}
      <LockedInCelebration
        bet={showLockedInCelebration ? bet : null}
        currentUserId={currentUserId}
        onDismiss={() => setShowLockedInCelebration(false)}
      />

      {/* Winner celebration - shows on live SETTLED transition */}
      <WinnerCelebration
        bet={showWinCelebration ? bet : null}
        currentUserId={currentUserId}
        onDismiss={() => setShowWinCelebration(false)}
      />
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
