import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Coins, PencilSimple, X } from 'phosphor-react-native';
import { z } from 'zod';

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useForm } from '@/hooks/use-form';
import { useCreateBet } from '@/hooks/use-create-bet';
import { useQuestionTemplates } from '@/hooks/use-question-templates';
import {
  getRpcErrorMessage,
  useRoomDetail,
  useRoomMembers,
  type RoomMemberWithProfile,
} from '@/hooks/use-rooms';
import {
  BetTemplateIcon,
  EXPIRY_PRESETS,
  composeTemplateQuestion,
  composeWriteInQuestion,
} from '@/lib/bet-create-ui';

const BINARY_OPTIONS = ['Yes', 'No'] as const;

const createBetSchema = z
  .object({
    memberId: z.string().min(1, 'Choose who this bet is about'),
    templateId: z.string().nullable(),
    writeInOpen: z.boolean(),
    writeInBody: z.string(),
    stake: z
      .string()
      .min(1, 'Stake is required')
      .refine((v) => parseInt(v, 10) > 0, 'Enter a positive stake (whole chips)'),
    expiryIndex: z.number(),
  })
  .refine(
    (data) => data.templateId !== null || (data.writeInOpen && data.writeInBody.trim().length > 0),
    { message: 'Pick a template or write your own question' },
  );

type ReviewPayload = {
  finalQuestion: string;
  stake: number;
  expiryIndex: number;
  templateId: string | null;
  subjectDisplayName: string | null;
  memberAvatarUrl: string | null;
  memberDisplayName: string;
};

function memberDisplayName(m: RoomMemberWithProfile): string {
  return m.profiles?.display_name?.trim() || 'Player';
}

export default function CreateBetScreen() {
  const { id: roomId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const safeInsets = useSafeAreaInsets();
  const { data: room, isLoading: roomLoading } = useRoomDetail(roomId);
  const { data: members, isLoading: membersLoading } = useRoomMembers(roomId);
  const { data: templates, isLoading: templatesLoading } = useQuestionTemplates('golf');
  const createBet = useCreateBet();

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewPayload, setReviewPayload] = useState<ReviewPayload | null>(null);

  const form = useForm({
    defaultValues: {
      memberId: '',
      templateId: null as string | null,
      writeInOpen: false,
      writeInBody: '',
      stake: '10',
      expiryIndex: 0,
    },
    validators: {
      onChange: createBetSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      if (!roomId) return;

      const member = members?.find((m) => m.user_id === value.memberId) ?? null;
      if (!member) return;

      const name = memberDisplayName(member);
      const tpl = templates?.find((t) => t.id === value.templateId) ?? null;
      const finalQuestion = tpl
        ? composeTemplateQuestion(tpl.question_text, name)
        : composeWriteInQuestion(value.writeInBody.trim(), name);

      const stakeNum = parseInt(value.stake, 10);
      const expiresAt = new Date(
        Date.now() + EXPIRY_PRESETS[value.expiryIndex].offsetMs,
      ).toISOString();

      try {
        await createBet.mutateAsync({
          p_room_id: roomId,
          p_question: finalQuestion,
          p_options: [...BINARY_OPTIONS],
          p_stake: stakeNum,
          p_expires_at: expiresAt,
          p_template_id: tpl?.id ?? null,
          p_subject_display_name: tpl ? name : null,
        });
        setReviewOpen(false);
        setReviewPayload(null);
        router.replace(`/(tabs)/rooms/${roomId}`);
      } catch (err) {
        formApi.setErrorMap({
          onSubmit: { fields: {}, form: getRpcErrorMessage(err) },
        });
      }
    },
  });

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

    const member = members?.find((m) => m.user_id === values.memberId) ?? null;
    if (!member) return;

    const name = memberDisplayName(member);
    const tpl = templates?.find((t) => t.id === values.templateId) ?? null;
    const finalQuestion = tpl
      ? composeTemplateQuestion(tpl.question_text, name)
      : composeWriteInQuestion(values.writeInBody.trim(), name);

    const stakeNum = parseInt(values.stake, 10);

    form.setErrorMap({});
    setReviewPayload({
      finalQuestion,
      stake: stakeNum,
      expiryIndex: values.expiryIndex,
      templateId: tpl?.id ?? null,
      subjectDisplayName: tpl ? name : null,
      memberAvatarUrl: member.profiles?.avatar_url ?? null,
      memberDisplayName: name,
    });
    setReviewOpen(true);
  }

  const openWriteIn = useCallback(() => {
    form.setErrorMap({});
    form.setFieldValue('templateId', null);
    form.setFieldValue('writeInOpen', true);
  }, [form]);

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

  return (
    <Pressable className="flex-1 bg-background" onPress={Keyboard.dismiss}>
      <ScreenHeader title="Create Bet" subtitle={room.name} showBack />

      <View className="px-5 pb-3">
        <View className="flex-row gap-2">
          <View className="h-2 flex-1 rounded-full bg-primary" />
          <View className={`h-2 flex-1 rounded-full ${reviewOpen ? 'bg-primary' : 'bg-border'}`} />
        </View>
        <Text className="mt-1.5 text-center text-xs font-medium text-text-secondary">
          {reviewOpen ? 'Step 2 · Confirm' : 'Step 1 · Quick setup'}
        </Text>
      </View>

      <form.AppForm>
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-10 pt-1"
          keyboardShouldPersistTaps="handled"
        >
          {!sessionActive ? (
            <View className="mb-4 rounded-xl border border-border bg-surface px-4 py-3">
              <Text className="text-center text-base text-text-secondary">
                This session has ended. You cannot create new bets.
              </Text>
            </View>
          ) : null}

          <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
            {(formError) =>
              formError ? (
                <View className="mb-4 items-center rounded-xl bg-error/10 px-4 py-3">
                  <Text className="text-center text-base text-error">
                    {typeof formError === 'string' ? formError : 'An error occurred'}
                  </Text>
                </View>
              ) : null
            }
          </form.Subscribe>

          {/* Players */}
          <View className="mb-5">
            <Text className="mb-3 text-base font-semibold text-white">Who is this about?</Text>
            {membersLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <form.Subscribe selector={(state) => state.values.memberId}>
                {(memberId) => (
                  <FlatList
                    horizontal
                    data={members ?? []}
                    keyExtractor={(item) => item.id}
                    showsHorizontalScrollIndicator={false}
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
                            className={`rounded-full p-1 ${
                              selected ? 'border-2 border-primary' : 'border-2 border-transparent'
                            }`}
                          >
                            <Avatar uri={item.profiles?.avatar_url} fallback={name} size="xl" />
                          </View>
                          <Text
                            className="mt-1.5 max-w-[76px] text-center text-xs font-medium text-text-secondary"
                            numberOfLines={1}
                          >
                            {name}
                          </Text>
                        </TouchableOpacity>
                      );
                    }}
                  />
                )}
              </form.Subscribe>
            )}
          </View>

          {/* Templates */}
          <View className="mb-4">
            <Text className="mb-3 text-base font-semibold text-white">Choose a bet</Text>
            <form.Subscribe
              selector={(state) => [state.values.templateId, state.values.writeInOpen] as const}
            >
              {([templateId, writeInOpen]) => (
                <>
                  {templatesLoading ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <form.AppField name="templateId">
                      {(field) => (
                        <field.OptionField
                          layout="grid-2"
                          className="mb-0"
                          disabled={!sessionActive}
                          onSelectionChange={() => {
                            form.setErrorMap({});
                            form.setFieldValue('writeInOpen', false);
                            form.setFieldValue('writeInBody', '');
                          }}
                          options={(templates ?? []).map((t) => ({
                            id: t.id,
                            value: t.id,
                            label: t.short_label,
                            sublabel: 'Yes / No',
                            icon: (
                              <BetTemplateIcon slug={t.slug} color={colors.primary} size={40} />
                            ),
                          }))}
                        />
                      )}
                    </form.AppField>
                  )}

                  <TouchableOpacity
                    onPress={openWriteIn}
                    disabled={!sessionActive}
                    className={`mt-1 min-h-[72px] flex-row items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-3 ${
                      writeInOpen && !templateId ? 'border-primary bg-primary/10' : 'border-border'
                    }`}
                    activeOpacity={0.75}
                  >
                    <PencilSimple size={22} color={colors.primary} weight="bold" />
                    <View>
                      <Text className="text-base font-semibold text-white">Write-in (custom)</Text>
                      <Text className="text-sm text-text-secondary">Yes / No answers</Text>
                    </View>
                  </TouchableOpacity>

                  {writeInOpen ? (
                    <form.AppField name="writeInBody">
                      {(field) => (
                        <field.TextField
                          label="Your question"
                          placeholder="We will add the player name for you"
                          placeholderTextColor={colors.textMuted}
                          multiline
                          editable={sessionActive}
                          className="mt-3 mb-0"
                        />
                      )}
                    </form.AppField>
                  ) : null}
                </>
              )}
            </form.Subscribe>
          </View>

          {/* Stake */}
          <View className="mb-5">
            <Text className="mb-2 text-base font-semibold text-white">Stake</Text>
            <View className="flex-row items-center rounded-2xl border-2 border-border bg-surface px-2 py-1">
              <View className="min-w-0 flex-1">
                <form.AppField name="stake">
                  {(field) => (
                    <field.TextField
                      leftIcon={<Coins size={22} color={colors.chipsIcon} weight="fill" />}
                      transformValue={(t) => t.replace(/\D/g, '')}
                      placeholder="0"
                      keyboardType="number-pad"
                      editable={sessionActive}
                      selectTextOnFocus
                      className="mb-0"
                      inputClassName="border-0 bg-transparent text-2xl font-bold text-white"
                    />
                  )}
                </form.AppField>
              </View>
              <Text className="shrink-0 pr-2 text-base font-medium text-text-secondary">chips</Text>
            </View>
          </View>

          {/* Expiry */}
          <View className="mb-6">
            <Text className="mb-2 text-base font-semibold text-white">Expires</Text>
            <form.AppField name="expiryIndex">
              {(field) => (
                <field.OptionField
                  layout="wrap"
                  className="mb-0"
                  disabled={!sessionActive}
                  options={EXPIRY_PRESETS.map((preset, i) => ({
                    id: `expiry-${i}`,
                    label: preset.label,
                    value: i,
                  }))}
                />
              )}
            </form.AppField>
          </View>

          <Button size="lg" disabled={!sessionActive} onPress={handleReview}>
            Review and Post
          </Button>
        </ScrollView>

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
                      <Text className="text-xl font-bold text-white">Review bet</Text>
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

                    <View className="mb-4 flex-row items-center gap-3">
                      <Avatar
                        uri={reviewPayload?.memberAvatarUrl}
                        fallback={reviewPayload?.memberDisplayName ?? ''}
                        size="lg"
                      />
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-text-secondary">Player</Text>
                        <Text className="text-lg font-semibold text-white">
                          {reviewPayload?.memberDisplayName}
                        </Text>
                      </View>
                    </View>

                    <View className="mb-4 rounded-2xl border border-border bg-surface px-4 py-3">
                      <Text className="text-sm font-medium text-text-secondary">Question</Text>
                      <Text className="mt-1 text-base leading-6 text-white">
                        {reviewPayload?.finalQuestion}
                      </Text>
                    </View>

                    {reviewPayload?.templateId && reviewTemplate ? (
                      <View className="mb-3 flex-row justify-between border-b border-border py-2">
                        <Text className="text-sm text-text-secondary">Template</Text>
                        <Text className="text-sm font-semibold text-white">
                          {reviewTemplate.short_label}
                        </Text>
                      </View>
                    ) : null}

                    <View className="mb-3 flex-row justify-between border-b border-border py-2">
                      <Text className="text-sm text-text-secondary">Stake</Text>
                      <Text className="text-sm font-semibold text-white">
                        {reviewPayload?.stake ?? 0} chips
                      </Text>
                    </View>

                    <View className="mb-6 flex-row justify-between border-b border-border py-2">
                      <Text className="text-sm text-text-secondary">Expires in</Text>
                      <Text className="text-sm font-semibold text-white">
                        {EXPIRY_PRESETS[reviewPayload?.expiryIndex ?? 0].label}
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
    </Pressable>
  );
}
