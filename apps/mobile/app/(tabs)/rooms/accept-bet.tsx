import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Coins, Lock } from 'phosphor-react-native';

import { useTheme } from '@/providers/theme';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useBetDetail } from '@/hooks/use-activity-feed';
import { useJoinBet } from '@/hooks/use-join-bet';
import { useQuestionTemplates } from '@/hooks/use-question-templates';
import { useAuth } from '@/providers/auth';
import { getRpcErrorMessage } from '@/hooks/use-rooms';
import { BetTemplateIcon } from '@/lib/bet-create-ui';

export default function AcceptBetScreen() {
  const { colors } = useTheme();
  const { betId } = useLocalSearchParams<{ betId: string }>();
  const router = useRouter();
  const safeInsets = useSafeAreaInsets();
  const { session } = useAuth();
  const { data: bet, isLoading } = useBetDetail(betId ?? '');
  const { data: templates } = useQuestionTemplates('golf');
  const joinBet = useJoinBet();

  const options = useMemo(() => {
    if (!bet) return [] as string[];
    const raw = Array.isArray(bet.options) ? (bet.options as unknown[]) : [];
    return raw.filter((o): o is string => typeof o === 'string' && o.trim().length > 0);
  }, [bet]);

  const tally = useMemo(() => {
    const out: Record<string, number> = {};
    if (!bet) return out;
    for (const stake of bet.stakes ?? []) {
      const key = stake.pick;
      out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  }, [bet]);

  const currentUserStake = useMemo(() => {
    if (!bet || !session?.user.id) return null;
    return bet.stakes?.find((s) => s.user_id === session.user.id) ?? null;
  }, [bet, session?.user.id]);

  const isSubject =
    !!bet?.subject_user_id && !!session?.user.id && bet.subject_user_id === session.user.id;
  const subjectAllowedOption = bet?.subject_positive_option ?? null;

  const [selected, setSelected] = useState<string | null>(null);

  const subjectName = bet?.subject_profile?.display_name ?? 'the subject';
  const offererName = bet?.offered_by_profile?.display_name ?? 'Someone';
  const isNotOpen = !!bet && bet.status !== 'OPEN';
  const alreadyJoined = !!currentUserStake;

  const template = useMemo(() => {
    if (!bet?.template_id || !templates) return null;
    return templates.find((t) => t.id === bet.template_id) ?? null;
  }, [bet?.template_id, templates]);

  const handleLockIn = useCallback(() => {
    if (!bet || !selected) return;
    Alert.alert(
      'Lock in bet?',
      `You'll back "${selected}" for ${bet.stake.toLocaleString('en-US')} chips.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lock in',
          style: 'default',
          onPress: async () => {
            try {
              await joinBet.mutateAsync({
                p_bet_id: bet.id,
                p_pick: selected,
                roomId: bet.room_id,
              });
              router.back();
            } catch (err) {
              Alert.alert('Could not lock in bet', getRpcErrorMessage(err, 'Please try again.'));
            }
          },
        },
      ],
    );
  }, [joinBet, bet, router, selected]);

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

  const blockingMessage = alreadyJoined
    ? `You already backed "${currentUserStake?.pick}" on this bet.`
    : isNotOpen
      ? 'This bet is no longer open.'
      : null;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Join Bet" showBack showHome />

      <View className="flex-1 items-center px-6 pt-6">
        {/* Subject is the hero — the player the bet is about. */}
        <Avatar
          uri={bet.subject_profile?.avatar_url ?? bet.offered_by_profile?.avatar_url}
          fallback={subjectName}
          size="xl"
        />
        <Text className="mt-3 text-lg font-bold text-text-primary" numberOfLines={1}>
          {subjectName}
        </Text>
        <Text className="text-sm text-text-secondary" numberOfLines={1}>
          posted by {offererName}
        </Text>

        {/* Bet card — template icon for template bets, quote box for write-ins */}
        <View className="mt-6 w-full items-center rounded-3xl border border-border bg-surface px-6 py-5">
          {template ? (
            <>
              <View className="h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
                <BetTemplateIcon slug={template.slug} color={colors.primary} size={40} />
              </View>
              <Text className="mt-3 text-sm font-bold uppercase tracking-widest text-primary">
                {template.short_label}
              </Text>
              <Text
                className="mt-2 text-center text-lg font-semibold leading-6 text-text-primary"
                numberOfLines={4}
              >
                {bet.question}
              </Text>
            </>
          ) : (
            <>
              <Text className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                The bet
              </Text>
              <Text
                className="mt-2 text-center text-xl font-bold leading-7 text-text-primary"
                numberOfLines={4}
              >
                &ldquo;{bet.question}&rdquo;
              </Text>
            </>
          )}
        </View>

        {/* Stake pill */}
        <View className="mt-4 flex-row items-center gap-2 rounded-full bg-warning/15 px-4 py-2">
          <Coins size={20} color={colors.chipsIcon} weight="fill" />
          <Text className="text-lg font-bold text-warning">
            {bet.stake.toLocaleString('en-US')} chips
          </Text>
        </View>

        {/* Pick */}
        <Text className="mt-8 mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">
          Pick your side
        </Text>
        <View className="w-full flex-row gap-3">
          {options.map((option) => {
            const count = tally[option] ?? 0;
            const subjectDisallowed =
              isSubject && subjectAllowedOption !== null && option !== subjectAllowedOption;
            const isSelected = option === selected;
            const disabled = subjectDisallowed || !!blockingMessage;
            return (
              <TouchableOpacity
                key={option}
                onPress={() => !disabled && setSelected(option)}
                disabled={disabled}
                activeOpacity={0.75}
                className={`flex-1 items-center justify-center rounded-lg border-2 py-8 ${
                  subjectDisallowed
                    ? 'border-border bg-surface opacity-40'
                    : isSelected
                      ? 'border-primary bg-primary/15'
                      : 'border-border bg-surface'
                }`}
              >
                {subjectDisallowed ? (
                  <Lock size={18} color={colors.textMuted} weight="bold" />
                ) : isSelected ? (
                  <Check size={18} color={colors.primary} weight="bold" />
                ) : null}
                <Text
                  className={`mt-1 text-xl font-bold ${
                    subjectDisallowed
                      ? 'text-text-muted'
                      : isSelected
                        ? 'text-primary'
                        : 'text-text-primary'
                  }`}
                >
                  {option}
                </Text>
                <Text className="mt-0.5 text-[11px] font-semibold text-text-muted">
                  {count === 0 ? 'no backers' : count === 1 ? '1 backer' : `${count} backers`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {isSubject && subjectAllowedOption ? (
          <Text className="mt-3 max-w-[300px] text-center text-xs text-text-muted">
            This bet is about you. You can only back &ldquo;{subjectAllowedOption}&rdquo;.
          </Text>
        ) : null}

        {blockingMessage ? (
          <View className="mt-4 rounded-xl bg-error/10 px-4 py-3">
            <Text className="text-center text-sm text-error">{blockingMessage}</Text>
          </View>
        ) : null}
      </View>

      {/* Lock In CTA */}
      <View
        className="border-t border-border bg-background px-6 pt-4"
        style={{ paddingBottom: Math.max(safeInsets.bottom, 16) }}
      >
        <Button
          onPress={handleLockIn}
          loading={joinBet.isPending}
          disabled={!selected || !!blockingMessage}
          size="lg"
          className="py-5 rounded-lg"
        >
          {`Lock In \u00b7 ${bet.stake.toLocaleString('en-US')} chips`}
        </Button>
      </View>
    </View>
  );
}
