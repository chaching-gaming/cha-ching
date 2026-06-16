import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, Coins, PencilSimple, X } from 'phosphor-react-native';
import { z } from 'zod';

import { useTheme } from '@/providers/theme';
import { useAuth } from '@/providers/auth';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DiagonalOptionCard } from '@/components/form/diagonal-option-card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useForm } from '@/hooks/use-form';
import { useCreateBet } from '@/hooks/use-create-bet';
import { useQuestionTemplates } from '@/hooks/use-question-templates';
import { useMyRoomBalance, useRealtimeActivityFeed } from '@/hooks/use-activity-feed';
import {
  getRpcErrorMessage,
  useRoomDetail,
  useRoomMembers,
  type RoomMemberWithProfile,
} from '@/hooks/use-rooms';
import {
  BetTemplateIcon,
  CUSTOM_EXPIRY,
  EXPIRY_PRESETS,
  composeTemplateQuestion,
  composeWriteInQuestion,
  customExpiryToMs,
  formatCustomExpiryLabel,
  templateRequiresPlayer,
  type ExpiryUnit,
} from '@/lib/bet-create-ui';

const BINARY_OPTIONS = ['Yes', 'No'] as const;

// Step 1 validation: must have a template or custom question, plus a pick
const step1Schema = z
  .object({
    memberId: z.string(),
    templateId: z.string().nullable(),
    writeInOpen: z.boolean(),
    writeInBody: z.string(),
    offeredPick: z.string().min(1, 'Pick your side'),
  })
  .refine(
    (data) => data.templateId !== null || (data.writeInOpen && data.writeInBody.trim().length > 0),
    { message: 'Pick a template or write your own question' },
  );

// Full schema for final submission
const createBetSchema = z
  .object({
    memberId: z.string(),
    templateId: z.string().nullable(),
    writeInOpen: z.boolean(),
    writeInBody: z.string(),
    stake: z
      .string()
      .min(1, 'Stake is required')
      .refine((v) => parseInt(v, 10) > 0, 'Enter a positive stake (whole chips)'),
    expiryIndex: z.number(),
    offeredPick: z.string().min(1, 'Pick your side'),
    isCustomExpiry: z.boolean(),
    customExpiryMinutes: z.string(),
    customExpiryUnit: z.enum(['min', 'hr']),
  })
  .refine(
    (data) => data.templateId !== null || (data.writeInOpen && data.writeInBody.trim().length > 0),
    { message: 'Pick a template or write your own question' },
  )
  .refine(
    (data) => {
      if (!data.isCustomExpiry) return true;
      const val = parseInt(data.customExpiryMinutes, 10);
      if (isNaN(val) || val < 1) return false;
      const totalMinutes = data.customExpiryUnit === 'hr' ? val * 60 : val;
      return totalMinutes >= CUSTOM_EXPIRY.MIN_MINUTES && totalMinutes <= CUSTOM_EXPIRY.MAX_MINUTES;
    },
    { message: 'Custom expiry must be between 1 minute and 24 hours' },
  );

type ReviewPayload = {
  finalQuestion: string;
  stake: number;
  expiryIndex: number;
  templateId: string | null;
  subjectDisplayName: string | null;
  memberAvatarUrl: string | null;
  memberDisplayName: string | null;
  offeredPick: string;
  isCustomExpiry: boolean;
  customExpiryMinutes: string;
  customExpiryUnit: ExpiryUnit;
};

function memberDisplayName(m: RoomMemberWithProfile): string {
  return m.profiles?.display_name?.trim() || 'Player';
}

export default function CreateBetScreen() {
  const { colors } = useTheme();
  const { id: roomId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const safeInsets = useSafeAreaInsets();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const { data: room, isLoading: roomLoading } = useRoomDetail(roomId);
  const { data: members, isLoading: membersLoading } = useRoomMembers(roomId);
  const { data: templates, isLoading: templatesLoading } = useQuestionTemplates('golf');
  const { data: balance } = useMyRoomBalance(roomId ?? '');
  const createBet = useCreateBet();

  // Subscribe to realtime updates for members and balance
  useRealtimeActivityFeed(roomId ?? '');

  const scrollViewRef = useRef<KeyboardAwareScrollView>(null);

  const [step, setStep] = useState(1);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Track keyboard visibility for iOS sticky footer
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const showSub = Keyboard.addListener('keyboardWillShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const [reviewPayload, setReviewPayload] = useState<ReviewPayload | null>(null);

  const form = useForm({
    defaultValues: {
      memberId: '',
      templateId: null as string | null,
      writeInOpen: false,
      writeInBody: '',
      stake: '100',
      expiryIndex: 0,
      offeredPick: '',
      isCustomExpiry: false,
      customExpiryMinutes: '',
      customExpiryUnit: 'min' as ExpiryUnit,
    },
    validators: {
      onSubmit: createBetSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      if (!roomId) return;

      const member = value.memberId
        ? (members?.find((m) => m.user_id === value.memberId) ?? null)
        : null;
      const name = member ? memberDisplayName(member) : null;
      const tpl = templates?.find((t) => t.id === value.templateId) ?? null;
      const finalQuestion = tpl
        ? composeTemplateQuestion(tpl.question_text, name ?? '')
        : name
          ? composeWriteInQuestion(value.writeInBody.trim(), name)
          : value.writeInBody.trim();

      const stakeNum = parseInt(value.stake, 10);
      const offsetMs = value.isCustomExpiry
        ? customExpiryToMs(parseInt(value.customExpiryMinutes, 10), value.customExpiryUnit)
        : EXPIRY_PRESETS[value.expiryIndex].offsetMs;
      const expiresAt = new Date(Date.now() + offsetMs).toISOString();

      // Map display label back to actual option for templates
      // Templates have options: ["Yes", "No"] but display positive_label/negative_label (e.g., "Hit"/"Miss")
      let actualPick = value.offeredPick;
      if (tpl) {
        const opts = Array.isArray(tpl.options) ? tpl.options : [];
        if (value.offeredPick === tpl.positive_label && opts.length > 0) {
          actualPick = String(opts[0]);
        } else if (value.offeredPick === tpl.negative_label && opts.length > 1) {
          actualPick = String(opts[1]);
        }
      }

      try {
        await createBet.mutateAsync({
          p_room_id: roomId,
          p_question: finalQuestion,
          p_options: [...BINARY_OPTIONS],
          p_stake: stakeNum,
          p_expires_at: expiresAt,
          p_offered_pick: actualPick,
          p_subject_user_id: member?.user_id ?? null,
          p_subject_positive_option: null,
          p_template_id: tpl?.id ?? null,
          p_subject_display_name: tpl && name ? name : null,
        });
        setReviewOpen(false);
        setReviewPayload(null);
        // Always navigate to room detail page after creating bet
        router.replace(`/(tabs)/rooms/${roomId}`);
      } catch (err) {
        formApi.setErrorMap({
          onSubmit: { fields: {}, form: getRpcErrorMessage(err) },
        });
      }
    },
  });

  const handleTemplateSelect = useCallback(
    (templateId: string, pick: string) => {
      form.setErrorMap({});
      form.setFieldValue('templateId', templateId);
      form.setFieldValue('writeInOpen', false);
      form.setFieldValue('writeInBody', '');
      form.setFieldValue('offeredPick', pick);
    },
    [form],
  );

  const handleCustomSelect = useCallback(
    (pick: string) => {
      form.setErrorMap({});
      form.setFieldValue('templateId', null);
      form.setFieldValue('writeInOpen', true);
      form.setFieldValue('offeredPick', pick);
    },
    [form],
  );

  const handleNextStep = useCallback(() => {
    const values = form.state.values;
    const result = step1Schema.safeParse(values);
    if (!result.success) {
      form.setErrorMap({
        onSubmit: { fields: {}, form: result.error.issues[0]?.message ?? 'Please fix the errors' },
      });
      return;
    }

    // Validate member selection for templates that require {player}
    if (values.templateId) {
      const tpl = templates?.find((t) => t.id === values.templateId);
      if (tpl && templateRequiresPlayer(tpl.question_text) && !values.memberId) {
        form.setErrorMap({
          onSubmit: { fields: {}, form: 'Select a player for this bet type' },
        });
        return;
      }
    }

    // Prevent betting against yourself (only when picking the negative option)
    if (values.memberId && values.memberId === currentUserId) {
      const tpl = templates?.find((t) => t.id === values.templateId);
      const isNegativePick = tpl
        ? values.offeredPick === tpl.negative_label
        : values.writeInOpen && values.offeredPick === 'No';
      if (isNegativePick) {
        form.setErrorMap({
          onSubmit: { fields: {}, form: "You can't bet against yourself on this question" },
        });
        return;
      }
    }

    form.setErrorMap({});
    setStep(2);
  }, [form, templates, currentUserId]);

  const handlePrevStep = useCallback(() => {
    form.setErrorMap({});
    setStep(1);
  }, [form]);

  function handleReview() {
    if (!room?.is_active) return;

    const values = form.state.values;
    const result = createBetSchema.safeParse(values);
    if (!result.success) {
      form.setErrorMap({
        onSubmit: { fields: {}, form: result.error.issues[0]?.message ?? 'Please fix the errors' },
      });
      return;
    }

    const member = values.memberId
      ? (members?.find((m) => m.user_id === values.memberId) ?? null)
      : null;
    const name = member ? memberDisplayName(member) : null;
    const tpl = templates?.find((t) => t.id === values.templateId) ?? null;
    const finalQuestion = tpl
      ? composeTemplateQuestion(tpl.question_text, name ?? '')
      : name
        ? composeWriteInQuestion(values.writeInBody.trim(), name)
        : values.writeInBody.trim();

    const stakeNum = parseInt(values.stake, 10);

    form.setErrorMap({});
    setReviewPayload({
      finalQuestion,
      stake: stakeNum,
      expiryIndex: values.expiryIndex,
      templateId: tpl?.id ?? null,
      subjectDisplayName: tpl && name ? name : null,
      memberAvatarUrl: member?.profiles?.avatar_url ?? null,
      memberDisplayName: name,
      offeredPick: values.offeredPick,
      isCustomExpiry: values.isCustomExpiry,
      customExpiryMinutes: values.customExpiryMinutes,
      customExpiryUnit: values.customExpiryUnit,
    });
    setReviewOpen(true);
  }

  const closeReview = useCallback(() => {
    if (form.state.isSubmitting) return;
    setReviewOpen(false);
    setReviewPayload(null);
    form.setErrorMap({});
  }, [form]);

  const reviewTemplate = useMemo(
    () => templates?.find((t) => t.id === reviewPayload?.templateId) ?? null,
    [templates, reviewPayload?.templateId],
  );

  if (!roomId) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-base text-text-secondary">Missing room</Text>
      </View>
    );
  }

  if (roomLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!room) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-lg text-text-secondary">Room not found</Text>
      </View>
    );
  }

  const sessionActive = room.is_active;

  // Calculate bottom padding for scroll content
  const scrollBottomPadding =
    Platform.OS === 'android'
      ? Math.max(safeInsets.bottom, 12) + 12
      : Math.max(safeInsets.bottom, 20);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Create Bet"
        subtitle={room.name}
        showBack
        showHome
        right={
          <View className="flex-row items-center gap-1.5 rounded-full bg-primary/20 px-3 py-1.5">
            <Coins size={16} color={colors.chipsIcon} weight="fill" />
            <Text className="text-base font-bold text-text-primary" numberOfLines={1}>
              {balance ?? 0}
            </Text>
          </View>
        }
      />

      {/* Step Indicator */}
      <View className="flex-row items-center justify-center gap-2 py-3">
        <View className={`h-2 w-8 rounded-full ${step === 1 ? 'bg-primary' : 'bg-border'}`} />
        <View className={`h-2 w-8 rounded-full ${step === 2 ? 'bg-primary' : 'bg-border'}`} />
      </View>

      <form.AppForm>
        {step === 1 ? (
          /* STEP 1: Member + Template Selection */
          Platform.OS === 'ios' ? (
            /* iOS: KeyboardAwareScrollView + sticky footer (hidden when keyboard visible) */
            <>
              <KeyboardAwareScrollView
                ref={scrollViewRef}
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingHorizontal: 20,
                  paddingBottom: 20,
                  paddingTop: 4,
                }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                // extraScrollHeight={150}
                enableAutomaticScroll={true}
                keyboardOpeningTime={0}
              >
                {!sessionActive ? (
                  <View className="mb-3 rounded-xl border border-border bg-surface px-4 py-3">
                    <Text className="text-center text-base text-text-secondary">
                      This session has ended. You cannot create new bets.
                    </Text>
                  </View>
                ) : null}

                <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
                  {(formError) =>
                    formError ? (
                      <View className="mb-3 items-center rounded-xl bg-error/10 px-4 py-3">
                        <Text className="text-center text-base text-error">
                          {typeof formError === 'string' ? formError : 'An error occurred'}
                        </Text>
                      </View>
                    ) : null
                  }
                </form.Subscribe>

                {/* Players (required for templates with {player}, optional for custom) */}
                <View className="mb-4">
                  <form.Subscribe
                    selector={(state) => [state.values.memberId, state.values.templateId, state.values.offeredPick, state.values.writeInOpen] as const}
                  >
                    {([memberId, templateId, offeredPick, writeInOpen]) => {
                      const tpl = templates?.find((t) => t.id === templateId);
                      const isPlayerRequired = tpl && templateRequiresPlayer(tpl.question_text);
                      // Show warning only when user selects themselves AND picks the negative option
                      const isNegativePick = tpl
                        ? offeredPick === tpl.negative_label
                        : writeInOpen && offeredPick === 'No';
                      const showSelfBetWarning = memberId === currentUserId && isNegativePick;
                      return (
                        <>
                          <Text className="mb-2 text-sm font-medium text-text-secondary">
                            Who is this about?{' '}
                            {isPlayerRequired ? (
                              <Text className="text-primary">(required)</Text>
                            ) : (
                              '(optional)'
                            )}
                          </Text>
                          {membersLoading ? (
                            <ActivityIndicator color={colors.primary} />
                          ) : (
                            <FlatList
                              horizontal
                              data={members ?? []}
                              keyExtractor={(item) => item.id}
                              showsHorizontalScrollIndicator={false}
                              nestedScrollEnabled={true}
                              contentContainerClassName="gap-3"
                              renderItem={({ item }) => {
                                const selected = item.user_id === memberId;
                                const name = memberDisplayName(item);
                                return (
                                  <TouchableOpacity
                                    onPress={() => {
                                      form.setErrorMap({});
                                      const uid = item.user_id;
                                      if (uid) form.setFieldValue('memberId', uid);
                                    }}
                                    disabled={!sessionActive}
                                    className={`items-center rounded-2xl px-2 py-2 ${
                                      selected ? 'bg-primary/15' : 'bg-transparent'
                                    }`}
                                    activeOpacity={0.75}
                                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                  >
                                    <View
                                      className={`rounded-full p-0.5 ${
                                        selected
                                          ? 'border-2 border-primary'
                                          : 'border-2 border-transparent'
                                      }`}
                                    >
                                      <Avatar
                                        uri={item.profiles?.avatar_url}
                                        fallback={name}
                                        size="lg"
                                      />
                                    </View>
                                    <Text
                                      className="mt-1 max-w-[60px] text-center text-xs font-medium text-text-secondary"
                                      numberOfLines={1}
                                    >
                                      {name}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              }}
                            />
                          )}
                          {showSelfBetWarning && (
                            <View className="mt-2 rounded-xl bg-warning/15 px-3 py-2">
                              <Text className="text-sm text-warning">
                                You can't bet against yourself on this question
                              </Text>
                            </View>
                          )}
                        </>
                      );
                    }}
                  </form.Subscribe>
                </View>

                {/* Templates */}
                <View className="mb-4">
                  <Text className="mb-2 text-sm font-medium text-text-secondary">Choose a bet</Text>
                  <form.Subscribe
                    selector={(state) =>
                      [
                        state.values.templateId,
                        state.values.writeInOpen,
                        state.values.offeredPick,
                      ] as const
                    }
                  >
                    {([templateId, writeInOpen, offeredPick]) => (
                      <>
                        {templatesLoading ? (
                          <ActivityIndicator color={colors.primary} />
                        ) : (
                          <View className="flex-row flex-wrap gap-3">
                            {(templates ?? []).map((t) => {
                              const isActive = templateId === t.id;
                              return (
                                <DiagonalOptionCard
                                  key={t.id}
                                  icon={
                                    <BetTemplateIcon
                                      slug={t.slug}
                                      color={colors.primary}
                                      size={32}
                                    />
                                  }
                                  label={t.short_label}
                                  value={t.id}
                                  positiveLabel={t.positive_label}
                                  negativeLabel={t.negative_label}
                                  selectedPick={isActive ? offeredPick : null}
                                  onSelect={handleTemplateSelect}
                                  disabled={!sessionActive}
                                  isActive={isActive}
                                />
                              );
                            })}

                            {/* Custom write-in card */}
                            <DiagonalOptionCard
                              key="custom"
                              icon={<PencilSimple size={32} color={colors.primary} weight="bold" />}
                              label="Custom"
                              sublabel="Write your own"
                              value="custom"
                              positiveLabel="Yes"
                              negativeLabel="No"
                              selectedPick={writeInOpen ? offeredPick : null}
                              onSelect={(_, pick) => handleCustomSelect(pick)}
                              disabled={!sessionActive}
                              isActive={writeInOpen}
                            />
                          </View>
                        )}

                        {/* Write-in text field */}
                        {writeInOpen ? (
                          <form.AppField name="writeInBody">
                            {(field) => (
                              <View className="mt-3">
                                <field.TextField
                                  placeholder="Enter your question..."
                                  placeholderTextColor={colors.textMuted}
                                  multiline
                                  editable={sessionActive}
                                  className="mb-0"
                                  inputClassName="min-h-[60px]"
                                  onFocus={() => {
                                    setTimeout(() => {
                                      scrollViewRef.current?.scrollToEnd({ animated: true });
                                    }, 300);
                                  }}
                                  autoFocus
                                />
                              </View>
                            )}
                          </form.AppField>
                        ) : null}
                      </>
                    )}
                  </form.Subscribe>
                </View>
              </KeyboardAwareScrollView>

              {/* iOS sticky footer - hidden when keyboard visible */}
              {!keyboardVisible && (
                <View
                  className="border-t border-border bg-background px-5 pt-3"
                  style={{ paddingBottom: scrollBottomPadding }}
                >
                  <TouchableOpacity
                    onPress={handleNextStep}
                    disabled={!sessionActive}
                    activeOpacity={0.8}
                    className="flex-row items-center justify-center gap-2 rounded-xl bg-primary py-4"
                    style={{ opacity: sessionActive ? 1 : 0.5 }}
                  >
                    <Text className="text-base font-bold text-text-primary">Next</Text>
                    <ArrowRight size={20} color="#FFFFFF" weight="bold" />
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            /* Android: KeyboardAwareScrollView with sticky footer */
            <>
              <KeyboardAwareScrollView
                ref={scrollViewRef}
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingHorizontal: 20,
                  paddingBottom: 20,
                  paddingTop: 4,
                }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                enableOnAndroid={true}
                extraScrollHeight={100}
                enableAutomaticScroll={true}
                keyboardOpeningTime={0}
              >
                {!sessionActive ? (
                  <View className="mb-3 rounded-xl border border-border bg-surface px-4 py-3">
                    <Text className="text-center text-base text-text-secondary">
                      This session has ended. You cannot create new bets.
                    </Text>
                  </View>
                ) : null}

                <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
                  {(formError) =>
                    formError ? (
                      <View className="mb-3 items-center rounded-xl bg-error/10 px-4 py-3">
                        <Text className="text-center text-base text-error">
                          {typeof formError === 'string' ? formError : 'An error occurred'}
                        </Text>
                      </View>
                    ) : null
                  }
                </form.Subscribe>

                {/* Players (required for templates with {player}, optional for custom) */}
                <View className="mb-4">
                  <form.Subscribe
                    selector={(state) => [state.values.memberId, state.values.templateId, state.values.offeredPick, state.values.writeInOpen] as const}
                  >
                    {([memberId, templateId, offeredPick, writeInOpen]) => {
                      const tpl = templates?.find((t) => t.id === templateId);
                      const isPlayerRequired = tpl && templateRequiresPlayer(tpl.question_text);
                      // Show warning only when user selects themselves AND picks the negative option
                      const isNegativePick = tpl
                        ? offeredPick === tpl.negative_label
                        : writeInOpen && offeredPick === 'No';
                      const showSelfBetWarning = memberId === currentUserId && isNegativePick;
                      return (
                        <>
                          <Text className="mb-2 text-sm font-medium text-text-secondary">
                            Who is this about?{' '}
                            {isPlayerRequired ? (
                              <Text className="text-primary">(required)</Text>
                            ) : (
                              '(optional)'
                            )}
                          </Text>
                          {membersLoading ? (
                            <ActivityIndicator color={colors.primary} />
                          ) : (
                            <FlatList
                              horizontal
                              data={members ?? []}
                              keyExtractor={(item) => item.id}
                              showsHorizontalScrollIndicator={false}
                              nestedScrollEnabled={true}
                              contentContainerClassName="gap-3"
                              renderItem={({ item }) => {
                                const selected = item.user_id === memberId;
                                const name = memberDisplayName(item);
                                return (
                                  <TouchableOpacity
                                    onPress={() => {
                                      form.setErrorMap({});
                                      const uid = item.user_id;
                                      if (uid) form.setFieldValue('memberId', uid);
                                    }}
                                    disabled={!sessionActive}
                                    className={`items-center rounded-2xl px-2 py-2 ${
                                      selected ? 'bg-primary/15' : 'bg-transparent'
                                    }`}
                                    activeOpacity={0.75}
                                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                  >
                                    <View
                                      className={`rounded-full p-0.5 ${
                                        selected
                                          ? 'border-2 border-primary'
                                          : 'border-2 border-transparent'
                                      }`}
                                    >
                                      <Avatar
                                        uri={item.profiles?.avatar_url}
                                        fallback={name}
                                        size="lg"
                                      />
                                    </View>
                                    <Text
                                      className="mt-1 max-w-[60px] text-center text-xs font-medium text-text-secondary"
                                      numberOfLines={1}
                                    >
                                      {name}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              }}
                            />
                          )}
                          {showSelfBetWarning && (
                            <View className="mt-2 rounded-xl bg-warning/15 px-3 py-2">
                              <Text className="text-sm text-warning">
                                You can't bet against yourself on this question
                              </Text>
                            </View>
                          )}
                        </>
                      );
                    }}
                  </form.Subscribe>
                </View>

                {/* Templates */}
                <View className="mb-4">
                  <Text className="mb-2 text-sm font-medium text-text-secondary">Choose a bet</Text>
                  <form.Subscribe
                    selector={(state) =>
                      [
                        state.values.templateId,
                        state.values.writeInOpen,
                        state.values.offeredPick,
                      ] as const
                    }
                  >
                    {([templateId, writeInOpen, offeredPick]) => (
                      <>
                        {templatesLoading ? (
                          <ActivityIndicator color={colors.primary} />
                        ) : (
                          <View className="flex-row flex-wrap gap-3">
                            {(templates ?? []).map((t) => {
                              const isActive = templateId === t.id;
                              return (
                                <DiagonalOptionCard
                                  key={t.id}
                                  icon={
                                    <BetTemplateIcon
                                      slug={t.slug}
                                      color={colors.primary}
                                      size={32}
                                    />
                                  }
                                  label={t.short_label}
                                  value={t.id}
                                  positiveLabel={t.positive_label}
                                  negativeLabel={t.negative_label}
                                  selectedPick={isActive ? offeredPick : null}
                                  onSelect={handleTemplateSelect}
                                  disabled={!sessionActive}
                                  isActive={isActive}
                                />
                              );
                            })}

                            {/* Custom write-in card */}
                            <DiagonalOptionCard
                              key="custom"
                              icon={<PencilSimple size={32} color={colors.primary} weight="bold" />}
                              label="Custom"
                              sublabel="Write your own"
                              value="custom"
                              positiveLabel="Yes"
                              negativeLabel="No"
                              selectedPick={writeInOpen ? offeredPick : null}
                              onSelect={(_, pick) => handleCustomSelect(pick)}
                              disabled={!sessionActive}
                              isActive={writeInOpen}
                            />
                          </View>
                        )}

                        {/* Write-in text field */}
                        {writeInOpen ? (
                          <form.AppField name="writeInBody">
                            {(field) => (
                              <View className="mt-3">
                                <field.TextField
                                  placeholder="Enter your question..."
                                  placeholderTextColor={colors.textMuted}
                                  multiline
                                  editable={sessionActive}
                                  className="mb-0"
                                  inputClassName="min-h-[60px]"
                                  onFocus={() => {
                                    setTimeout(() => {
                                      scrollViewRef.current?.scrollToEnd({ animated: true });
                                    }, 300);
                                  }}
                                  autoFocus
                                />
                              </View>
                            )}
                          </form.AppField>
                        ) : null}
                      </>
                    )}
                  </form.Subscribe>
                </View>
              </KeyboardAwareScrollView>

              {/* Android sticky footer */}
              <View
                className="border-t border-border bg-background px-5 pt-3"
                style={{ paddingBottom: scrollBottomPadding }}
              >
                <TouchableOpacity
                  onPress={handleNextStep}
                  disabled={!sessionActive}
                  activeOpacity={0.8}
                  className="flex-row items-center justify-center gap-2 rounded-xl bg-primary py-4"
                  style={{ opacity: sessionActive ? 1 : 0.5 }}
                >
                  <Text className="text-base font-bold text-text-primary">Next</Text>
                  <ArrowRight size={20} color="#FFFFFF" weight="bold" />
                </TouchableOpacity>
              </View>
            </>
          )
        ) : (
          /* STEP 2: Stake + Expiry */
          <>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, paddingTop: 4 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
                {(formError) =>
                  formError ? (
                    <View className="mb-3 items-center rounded-xl bg-error/10 px-4 py-3">
                      <Text className="text-center text-base text-error">
                        {typeof formError === 'string' ? formError : 'An error occurred'}
                      </Text>
                    </View>
                  ) : null
                }
              </form.Subscribe>

              {/* Summary of Step 1 */}
              <View className="mb-5 rounded-2xl border border-border bg-surface p-4">
                <Text className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                  Your bet
                </Text>
                <form.Subscribe
                  selector={(state) =>
                    [
                      state.values.templateId,
                      state.values.writeInBody,
                      state.values.offeredPick,
                      state.values.memberId,
                    ] as const
                  }
                >
                  {([templateId, writeInBody, offeredPick, memberId]) => {
                    const tpl = templates?.find((t) => t.id === templateId);
                    const member = members?.find((m) => m.user_id === memberId);
                    // offeredPick is already stored as the display label (e.g., "Hit"/"Miss")
                    const displayPick = offeredPick;

                    return (
                      <>
                        <Text className="text-base font-semibold text-text-primary">
                          {tpl?.short_label ?? 'Custom Question'}
                          {member ? ` · ${memberDisplayName(member)}` : ''}
                        </Text>
                        {!tpl && writeInBody ? (
                          <Text className="mt-1 text-sm text-text-secondary" numberOfLines={2}>
                            {writeInBody}
                          </Text>
                        ) : null}
                        <View className="mt-2 flex-row items-center gap-2">
                          <Text className="text-sm text-text-secondary">Your pick:</Text>
                          <View className="rounded-lg bg-primary/20 px-2 py-0.5">
                            <Text className="text-sm font-bold text-primary">{displayPick}</Text>
                          </View>
                        </View>
                      </>
                    );
                  }}
                </form.Subscribe>
              </View>

              {/* Stake */}
              <View className="mb-4">
                <Text className="mb-2 text-sm font-medium text-text-secondary">Stake</Text>
                <form.AppField name="stake">
                  {(field) => (
                    <field.TextField
                      leftIcon={<Coins size={18} color={colors.chipsIcon} weight="fill" />}
                      transformValue={(t) => t.replace(/\D/g, '')}
                      placeholder="0"
                      keyboardType="number-pad"
                      editable={sessionActive}
                      selectTextOnFocus
                      className="mb-0"
                      inputClassName="text-lg font-bold"
                    />
                  )}
                </form.AppField>
              </View>

              {/* Expiry */}
              <View className="mb-4">
                <Text className="mb-2 text-sm font-medium text-text-secondary">Expires in</Text>
                <form.Subscribe
                  selector={(state) =>
                    [
                      state.values.expiryIndex,
                      state.values.isCustomExpiry,
                      state.values.customExpiryMinutes,
                      state.values.customExpiryUnit,
                    ] as const
                  }
                >
                  {([expiryIndex, isCustomExpiry, customExpiryMinutes, customExpiryUnit]) => (
                    <>
                      {/* All options in one row: 30s, 1m, 2m, Custom */}
                      <View className="flex-row gap-2">
                        {EXPIRY_PRESETS.map((preset, i) => {
                          const selected = !isCustomExpiry && expiryIndex === i;
                          return (
                            <TouchableOpacity
                              key={`expiry-${i}`}
                              onPress={() => {
                                form.setFieldValue('isCustomExpiry', false);
                                form.setFieldValue('expiryIndex', i);
                              }}
                              disabled={!sessionActive}
                              className={`flex-1 items-center rounded-xl py-3 ${
                                selected
                                  ? 'border-2 border-primary bg-primary/15'
                                  : 'border border-border bg-surface'
                              }`}
                              activeOpacity={0.7}
                            >
                              <Text
                                className={`text-sm font-semibold ${
                                  selected ? 'text-primary' : 'text-text-secondary'
                                }`}
                              >
                                {preset.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                        {/* Custom chip */}
                        <TouchableOpacity
                          onPress={() => {
                            form.setFieldValue('isCustomExpiry', true);
                          }}
                          disabled={!sessionActive}
                          className={`flex-1 items-center rounded-xl py-3 ${
                            isCustomExpiry
                              ? 'border-2 border-primary bg-primary/15'
                              : 'border border-border bg-surface'
                          }`}
                          activeOpacity={0.7}
                        >
                          <Text
                            className={`text-sm font-semibold ${
                              isCustomExpiry ? 'text-primary' : 'text-text-secondary'
                            }`}
                          >
                            Custom
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Custom expiry input - expands below when selected */}
                      {isCustomExpiry && (
                        <View className="mt-3 flex-row items-center gap-3">
                          <TextInput
                            value={customExpiryMinutes}
                            onChangeText={(text) => {
                              form.setFieldValue('customExpiryMinutes', text.replace(/\D/g, ''));
                            }}
                            placeholder="0"
                            placeholderTextColor={colors.textMuted}
                            keyboardType="number-pad"
                            editable={sessionActive}
                            selectTextOnFocus
                            className="min-w-[80px] flex-1 rounded-xl border border-border bg-surface px-4 text-lg font-bold text-text-primary"
                            style={[
                              {
                                height: 48,
                                textAlignVertical: 'center',
                                includeFontPadding: false,
                              },
                              Platform.OS === 'ios' && {
                                paddingTop: 0,
                                paddingBottom: 0,
                                lineHeight: 22,
                              },
                              Platform.OS === 'android' && {
                                paddingVertical: 12,
                              },
                            ]}
                          />
                          {/* Min/Hr toggle */}
                          <View className="flex-row rounded-xl border border-border bg-surface">
                            <TouchableOpacity
                              onPress={() => form.setFieldValue('customExpiryUnit', 'min')}
                              disabled={!sessionActive}
                              className={`rounded-l-xl px-4 py-3 ${
                                customExpiryUnit === 'min' ? 'bg-primary' : 'bg-transparent'
                              }`}
                              activeOpacity={0.7}
                            >
                              <Text
                                className={`text-sm font-semibold ${
                                  customExpiryUnit === 'min' ? 'text-background' : 'text-text-secondary'
                                }`}
                              >
                                min
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => form.setFieldValue('customExpiryUnit', 'hr')}
                              disabled={!sessionActive}
                              className={`rounded-r-xl px-4 py-3 ${
                                customExpiryUnit === 'hr' ? 'bg-primary' : 'bg-transparent'
                              }`}
                              activeOpacity={0.7}
                            >
                              <Text
                                className={`text-sm font-semibold ${
                                  customExpiryUnit === 'hr' ? 'text-background' : 'text-text-secondary'
                                }`}
                              >
                                hr
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </>
                  )}
                </form.Subscribe>
              </View>
            </ScrollView>

            {/* Sticky footer for Step 2 */}
            <View
              className="flex-row gap-3 border-t border-border bg-background px-5 pt-3"
              style={{ paddingBottom: scrollBottomPadding }}
            >
              <TouchableOpacity
                onPress={handlePrevStep}
                className="items-center justify-center rounded-xl border border-border bg-surface px-4"
                activeOpacity={0.7}
              >
                <ArrowLeft size={24} color={colors.textSecondary} />
              </TouchableOpacity>
              <Button size="lg" disabled={!sessionActive} onPress={handleReview} className="flex-1">
                Review and Post
              </Button>
            </View>
          </>
        )}

        {/* Review Modal */}
        <Modal visible={reviewOpen} animationType="slide" transparent onRequestClose={closeReview}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <form.Subscribe
              selector={(state) => [state.isSubmitting, state.errorMap.onSubmit] as const}
            >
              {([isSubmitting, submitError]) => (
                <Pressable
                  className="flex-1 justify-end bg-black/65"
                  onPress={closeReview}
                  disabled={isSubmitting}
                >
                  <Pressable
                    className="rounded-t-3xl border-t border-border bg-background px-5 pt-4"
                    style={{ paddingBottom: Math.max(safeInsets.bottom, 20) }}
                    onPress={(e) => e.stopPropagation()}
                  >
                    <View className="mb-4 flex-row items-center justify-between">
                      <Text className="text-xl font-bold text-text-primary">Review bet</Text>
                      <TouchableOpacity
                        onPress={closeReview}
                        disabled={isSubmitting}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      >
                        <X size={26} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>

                    {submitError ? (
                      <View className="mb-4 rounded-xl bg-error/10 px-4 py-3">
                        <Text className="text-center text-base text-error">
                          {typeof submitError === 'string' ? submitError : 'An error occurred'}
                        </Text>
                      </View>
                    ) : null}

                    {reviewPayload?.memberDisplayName ? (
                      <View className="mb-4 flex-row items-center gap-3">
                        <Avatar
                          uri={reviewPayload?.memberAvatarUrl}
                          fallback={reviewPayload?.memberDisplayName}
                          size="lg"
                        />
                        <View className="flex-1">
                          <Text className="text-sm font-medium text-text-secondary">Player</Text>
                          <Text className="text-lg font-semibold text-text-primary">
                            {reviewPayload?.memberDisplayName}
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    <View className="mb-4 rounded-2xl border border-border bg-surface px-4 py-3">
                      <Text className="text-sm font-medium text-text-secondary">Question</Text>
                      <Text className="mt-1 text-base leading-6 text-text-primary">
                        {reviewPayload?.finalQuestion}
                      </Text>
                    </View>

                    {reviewPayload?.templateId && reviewTemplate ? (
                      <View className="mb-3 flex-row justify-between border-b border-border py-2">
                        <Text className="text-sm text-text-secondary">Template</Text>
                        <Text className="text-sm font-semibold text-text-primary">
                          {reviewTemplate.short_label}
                        </Text>
                      </View>
                    ) : null}

                    <View className="mb-3 flex-row justify-between border-b border-border py-2">
                      <Text className="text-sm text-text-secondary">Your pick</Text>
                      <Text className="text-sm font-semibold text-primary">
                        {reviewPayload?.offeredPick}
                      </Text>
                    </View>

                    <View className="mb-3 flex-row justify-between border-b border-border py-2">
                      <Text className="text-sm text-text-secondary">Stake</Text>
                      <Text className="text-sm font-semibold text-text-primary">
                        {reviewPayload?.stake ?? 0} chips
                      </Text>
                    </View>

                    <View className="mb-6 flex-row justify-between border-b border-border py-2">
                      <Text className="text-sm text-text-secondary">Expires in</Text>
                      <Text className="text-sm font-semibold text-text-primary">
                        {reviewPayload?.isCustomExpiry
                          ? formatCustomExpiryLabel(
                              parseInt(reviewPayload.customExpiryMinutes, 10),
                              reviewPayload.customExpiryUnit,
                            )
                          : EXPIRY_PRESETS[reviewPayload?.expiryIndex ?? 0].label}
                      </Text>
                    </View>

                    <Button onPress={() => form.handleSubmit()} loading={isSubmitting}>
                      Post Bet to Room
                    </Button>
                  </Pressable>
                </Pressable>
              )}
            </form.Subscribe>
          </GestureHandlerRootView>
        </Modal>
      </form.AppForm>
    </View>
  );
}
