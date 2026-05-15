import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { ResolveDisputeSheet } from '@/components/activity/resolve-dispute-sheet';
import { SubmitOutcomeSheet } from '@/components/activity/submit-outcome-sheet';
import { VoidBetSheet } from '@/components/activity/void-bet-sheet';
import {
  betDetailKey,
  useBetDetail,
  type BetStakeWithProfile,
} from '@/hooks/use-activity-feed';
import { useRoomDetail, useRoomMembers } from '@/hooks/use-rooms';
import { useAuth } from '@/providers/auth';
import { formatBetCountdown, formatRelativeActivityTime } from '@/lib/date-format';
import { getEffectiveBetStatus } from '@/lib/effective-bet-status';
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

  const [tick, setTick] = useState(0);
  const [submitSheetOpen, setSubmitSheetOpen] = useState(false);
  const [disputeSheetOpen, setDisputeSheetOpen] = useState(false);
  const [voidSheetOpen, setVoidSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const dbStatus = bet?.status ?? '';

  // Tick every second for countdown when bet is OPEN
  useEffect(() => {
    if (dbStatus !== 'OPEN' || !bet?.expires_at) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [dbStatus, bet?.expires_at]);

  // Realtime subscription for bet updates
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`bet-detail:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bets', filter: `id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: betDetailKey(id) })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bet_stakes', filter: `bet_id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: betDetailKey(id) })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'outcome_submissions', filter: `bet_id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: betDetailKey(id) })
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, queryClient]);

  void tick;

  const effectiveStatus = useMemo(
    () => (bet ? getEffectiveBetStatus(bet, new Date()) : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bet, tick]
  );

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

  const countdown =
    effectiveStatus === 'OPEN' ? formatBetCountdown(bet?.expires_at, new Date()) : null;

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
    [stakes, currentUserId]
  );
  const currentUserLost = dbStatus === 'SETTLED' && !!myStake && !currentUserWon;

  // Outcome submissions
  const outcomeSubmissions = useMemo(() => bet?.outcome_submissions ?? [], [bet?.outcome_submissions]);
  const submittedCount = outcomeSubmissions.length;
  const totalParticipants = stakes.length;
  const mySubmission = useMemo(
    () => (currentUserId ? (outcomeSubmissions.find((s) => s.user_id === currentUserId) ?? null) : null),
    [outcomeSubmissions, currentUserId]
  );

  // Group submissions by option for attestor view
  const submissionsByOption = useMemo(() => {
    const grouped: Record<string, typeof outcomeSubmissions> = {};
    for (const option of options) {
      grouped[option] = outcomeSubmissions.filter(
        (s) => s.selected_option.trim().toLowerCase() === option.trim().toLowerCase()
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
    bet?.status === 'OPEN' &&
    !alreadyStaked &&
    effectiveStatus !== 'EXPIRED';

  // Can submit outcome? Use effectiveStatus for immediate client-side detection
  const isParticipant = !!myStake;
  const canSubmitOutcome = isActive && isParticipant && !mySubmission && effectiveStatus === 'PENDING_RESULT';

  // Can resolve? Use effectiveStatus for PENDING_RESULT to allow immediate action after expiry
  const allSubmitted = totalParticipants > 0 && submittedCount === totalParticipants;
  const canResolve = isAttestorOrAdmin && (dbStatus === 'DISPUTED' || (effectiveStatus === 'PENDING_RESULT' && allSubmitted));

  // Can void?
  const canVoid = currentUserRole === 'ADMIN' && dbStatus !== 'VOID';

  // Find user's submission in a stake
  const getUserSubmission = useCallback(
    (userId: string) => outcomeSubmissions.find((s) => s.user_id === userId),
    [outcomeSubmissions]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: betDetailKey(id ?? '') });
    setRefreshing(false);
  }, [id, queryClient]);

  const handleJoinBet = useCallback(() => {
    if (!bet) return;
    router.push(`/(tabs)/rooms/accept-bet?betId=${bet.id}`);
  }, [bet, router]);

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
      <ScreenHeader title="Bet Details" showBack />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: safeInsets.bottom + 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
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
        <View className={`mx-4 mt-4 rounded-2xl border border-border bg-surface p-4 ${dimmed ? 'opacity-60' : ''}`}>
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

          {/* Countdown */}
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
                Your pick: {myStake.pick}
                {bothSidesStaked && dbStatus !== 'VOID' && (
                  <Text className="text-primary/70">
                    {' '}· Win {Math.floor(pool / (stakesByPick[myStake.pick]?.length || 1)).toLocaleString('en-US')}
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
                Result: {bet.outcome}
                {bet.settlement_method && (
                  <Text className="text-text-muted"> · via {bet.settlement_method.toLowerCase()}</Text>
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
          <View className="mx-4 mt-3 flex-row items-center justify-between rounded-xl bg-surface px-4 py-3">
            <View className="flex-row items-center gap-2">
              <Text className="text-sm text-text-secondary">Submissions</Text>
              <Text className="font-bold text-primary">
                {submittedCount}/{totalParticipants}
              </Text>
            </View>
            {mySubmission ? (
              <View className="flex-row items-center gap-1">
                <Check size={14} color={colors.primary} weight="bold" />
                <Text className="text-sm text-primary">{mySubmission.selected_option}</Text>
              </View>
            ) : isParticipant ? (
              <Text className="text-sm text-warning">Awaiting your submission</Text>
            ) : null}
          </View>
        )}

        {/* PARTICIPANTS - Side by Side */}
        <View className={`mx-4 mt-4 flex-row gap-3 ${dimmed ? 'opacity-60' : ''}`}>
          {options.map((option, idx) => {
            const optionStakes = stakesByPick[option] ?? [];
            const isWinner = !!bet.outcome && option.trim().toLowerCase() === bet.outcome.trim().toLowerCase();
            const isLosingOption = dbStatus === 'SETTLED' && !!bet.outcome && !isWinner;
            const submissions = submissionsByOption[option] ?? [];
            const voteCount = submissions.length;
            const isLeft = idx === 0;

            return (
              <View
                key={option}
                className={`flex-1 rounded-2xl border bg-surface p-3 ${
                  isWinner ? 'border-primary' : isLosingOption ? 'border-border opacity-60' : 'border-border'
                }`}
              >
                {/* Option Header */}
                <View className={`mb-3 items-center ${isLeft ? '' : ''}`}>
                  <Text
                    className={`text-base font-bold uppercase ${
                      isWinner ? 'text-primary' : isLosingOption ? 'text-text-muted' : isLeft ? 'text-primary' : 'text-error'
                    }`}
                  >
                    {option}
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
                          {/* Submission status for attestors */}
                          {isAttestorOrAdmin && dbStatus === 'PENDING_RESULT' && (
                            <Text className={`text-xs ${submission ? 'text-primary' : 'text-text-muted'}`}>
                              {submission ? `→ ${submission.selected_option}` : 'Pending'}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View className="items-center py-4">
                    <Text className="text-xs text-text-muted">No backers</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Status hint for OPEN bets */}
        {dbStatus === 'OPEN' && isParticipant && (
          <View className="mx-4 mb-4 flex-row items-center gap-2">
            {bothSidesStaked ? (
              <>
                <Check size={14} color={colors.primary} weight="bold" />
                <Text className="text-sm text-text-secondary">
                  Matched! Waiting for expiry to submit outcomes.
                </Text>
              </>
            ) : (
              <Text className="text-sm text-text-muted">
                Waiting for someone to take the other side.
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Bottom Actions */}
      <View
        className="absolute bottom-0 left-0 right-0 border-t border-border bg-background px-6 pt-4"
        style={{ paddingBottom: Math.max(safeInsets.bottom, 16) }}
      >
        {canJoin ? (
          <Button onPress={handleJoinBet} size="lg">
            {`Join Bet · ${formatStakeChips(bet.stake)}`}
          </Button>
        ) : canSubmitOutcome ? (
          <Button onPress={() => setSubmitSheetOpen(true)} size="lg">
            Submit Outcome
          </Button>
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
        />
      )}

      {canResolve && bet.room_id && (
        <ResolveDisputeSheet
          visible={disputeSheetOpen}
          onClose={() => setDisputeSheetOpen(false)}
          bet={bet}
          roomId={bet.room_id}
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
    </View>
  );
}

function groupStakesByPick(
  options: string[],
  stakes: BetStakeWithProfile[]
): Record<string, BetStakeWithProfile[]> {
  const out: Record<string, BetStakeWithProfile[]> = {};
  for (const option of options) out[option] = [];
  for (const stake of stakes) {
    const key = options.find((o) => o.trim().toLowerCase() === stake.pick.trim().toLowerCase());
    if (key) out[key].push(stake);
  }
  return out;
}
