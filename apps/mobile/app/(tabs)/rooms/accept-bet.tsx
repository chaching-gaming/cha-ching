import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Coins, Lock } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useAcceptBet } from '@/hooks/use-accept-bet';
import { useBetDetail } from '@/hooks/use-activity-feed';
import { useQuestionTemplates } from '@/hooks/use-question-templates';
import { useAuth } from '@/providers/auth';
import { getRpcErrorMessage } from '@/hooks/use-rooms';
import { BetTemplateIcon } from '@/lib/bet-create-ui';

export default function AcceptBetScreen() {
  const { betId } = useLocalSearchParams<{ betId: string }>();
  const router = useRouter();
  const safeInsets = useSafeAreaInsets();
  const { session } = useAuth();
  const { data: bet, isLoading } = useBetDetail(betId ?? '');
  const { data: templates } = useQuestionTemplates('golf');
  const acceptBet = useAcceptBet();

  const options = useMemo(() => {
    if (!bet) return [] as string[];
    const raw = Array.isArray(bet.options) ? (bet.options as unknown[]) : [];
    return raw.filter((o): o is string => typeof o === 'string' && o.trim().length > 0);
  }, [bet]);

  const oppositePick = useMemo(() => {
    if (!bet?.offered_pick) return null;
    const offered = bet.offered_pick.trim().toLowerCase();
    const candidate = options.find((o) => o.trim().toLowerCase() !== offered);
    return candidate ?? null;
  }, [bet?.offered_pick, options]);

  const [selected, setSelected] = useState<string | null>(null);

  // Pre-select the opposite pick once the bet loads.
  useEffect(() => {
    if (!selected && oppositePick) setSelected(oppositePick);
  }, [oppositePick, selected]);

  const offererName = bet?.offered_by_profile?.display_name ?? 'Someone';
  const isOwnBet = !!session?.user.id && bet?.offered_by === session.user.id;
  const isNotOpen = !!bet && bet.status !== 'OPEN';

  const template = useMemo(() => {
    if (!bet?.template_id || !templates) return null;
    return templates.find((t) => t.id === bet.template_id) ?? null;
  }, [bet?.template_id, templates]);

  const handleLockIn = useCallback(() => {
    if (!bet || !selected) return;
    Alert.alert(
      'Lock in bet?',
      `You'll take "${selected}" for ${bet.stake.toLocaleString('en-US')} chips.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lock in',
          style: 'default',
          onPress: async () => {
            try {
              await acceptBet.mutateAsync({
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
  }, [acceptBet, bet, router, selected]);

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

  const blockingMessage = isOwnBet
    ? 'You posted this bet — you can\u2019t accept your own wager.'
    : isNotOpen
      ? 'This bet is no longer open.'
      : null;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Accept Bet" showBack />

      <View className="flex-1 items-center px-6 pt-6">
        {/* Player (bet subject) */}
        <Avatar uri={bet.offered_by_profile?.avatar_url} fallback={offererName} size="xl" />
        <Text className="mt-3 text-lg font-bold text-white" numberOfLines={1}>
          {offererName}
        </Text>
        <Text className="text-sm text-text-secondary">posted this bet</Text>

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
                className="mt-2 text-center text-lg font-semibold leading-6 text-white"
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
                className="mt-2 text-center text-xl font-bold leading-7 text-white"
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
          Pick your answer
        </Text>
        <View className="w-full flex-row gap-3">
          {options.map((option) => {
            const isOfferer = option === bet.offered_pick;
            const isSelected = option === selected;
            const disabled = isOfferer || !!blockingMessage;
            return (
              <TouchableOpacity
                key={option}
                onPress={() => !disabled && setSelected(option)}
                disabled={disabled}
                activeOpacity={0.75}
                className={`flex-1 items-center justify-center rounded-2xl border-2 py-6 ${
                  isOfferer
                    ? 'border-border bg-surface opacity-40'
                    : isSelected
                      ? 'border-primary bg-primary/15'
                      : 'border-border bg-surface'
                }`}
              >
                {isOfferer ? (
                  <Lock size={18} color={colors.textMuted} weight="bold" />
                ) : isSelected ? (
                  <Check size={18} color={colors.primary} weight="bold" />
                ) : null}
                <Text
                  className={`mt-1 text-xl font-bold ${
                    isOfferer ? 'text-text-muted' : isSelected ? 'text-primary' : 'text-white'
                  }`}
                >
                  {option}
                </Text>
                {isSelected && !isOfferer ? (
                  <Text className="mt-0.5 text-[11px] font-semibold text-primary">Your pick</Text>
                ) : null}
                {isOfferer ? (
                  <Text className="mt-0.5 text-[11px] font-semibold text-text-muted">
                    {offererName}&rsquo;s pick
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text className="mt-3 text-center text-xs text-text-muted">
          {offererName} picked &ldquo;{bet.offered_pick ?? '—'}&rdquo;. You take the other side.
        </Text>

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
          loading={acceptBet.isPending}
          disabled={!selected || !!blockingMessage}
          size="lg"
        >
          {`Lock In \u00b7 ${bet.stake.toLocaleString('en-US')} chips`}
        </Button>
      </View>
    </View>
  );
}
