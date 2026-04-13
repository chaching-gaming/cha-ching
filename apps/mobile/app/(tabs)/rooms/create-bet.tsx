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

import { colors } from '@/constants/colors';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useForm } from '@/hooks/use-form';
import { useCreateBet } from '@/hooks/use-create-bet';
import { useQuestionTemplates, type QuestionTemplate } from '@/hooks/use-question-templates';
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

type ReviewPayload = {
  finalQuestion: string;
  stake: number;
  expiryIndex: number;
  templateId: string | null;
  subjectDisplayName: string | null;
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

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [writeInOpen, setWriteInOpen] = useState(false);
  const [expiryIndex, setExpiryIndex] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewPayload, setReviewPayload] = useState<ReviewPayload | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);

  const selectedMember = useMemo(
    () => members?.find((m) => m.user_id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const displayName = selectedMember ? memberDisplayName(selectedMember) : '';

  const form = useForm({
    defaultValues: {
      stake: '10',
      writeInBody: '',
    },
    onSubmit: async ({ value, formApi }) => {
      if (!room || !room.is_active) return;

      if (!selectedMemberId || !selectedMember) {
        formApi.setErrorMap({
          onSubmit: { fields: {}, form: 'Choose who this bet is about' },
        });
        return;
      }

      if (!selectedTemplateId && (!writeInOpen || !value.writeInBody.trim())) {
        formApi.setErrorMap({
          onSubmit: { fields: {}, form: 'Pick a template or write your own question' },
        });
        return;
      }

      const tpl = templates?.find((t) => t.id === selectedTemplateId) ?? null;
      let finalQuestion = '';
      if (tpl) {
        finalQuestion = composeTemplateQuestion(tpl.question_text, displayName);
      } else {
        finalQuestion = composeWriteInQuestion(value.writeInBody.trim(), displayName);
      }

      const stakeNum = parseInt(value.stake.replace(/\D/g, ''), 10);
      if (!Number.isFinite(stakeNum) || stakeNum <= 0) {
        formApi.setErrorMap({
          onSubmit: { fields: {}, form: 'Enter a positive stake (whole chips)' },
        });
        return;
      }

      formApi.setErrorMap({});
      setReviewPayload({
        finalQuestion,
        stake: stakeNum,
        expiryIndex,
        templateId: tpl?.id ?? null,
        subjectDisplayName: tpl ? displayName : null,
      });
      setReviewOpen(true);
      setSheetError(null);
    },
  });

  const selectTemplate = useCallback(
    (t: QuestionTemplate) => {
      form.setErrorMap({});
      setSelectedTemplateId(t.id);
      setWriteInOpen(false);
      form.setFieldValue('writeInBody', '');
    },
    [form],
  );

  const openWriteIn = useCallback(() => {
    form.setErrorMap({});
    setSelectedTemplateId(null);
    setWriteInOpen(true);
  }, [form]);

  const closeReview = useCallback(() => {
    if (isPosting) return;
    setReviewOpen(false);
    setReviewPayload(null);
    setSheetError(null);
  }, [isPosting]);

  const reviewTemplate = useMemo(
    () => templates?.find((t) => t.id === reviewPayload?.templateId) ?? null,
    [templates, reviewPayload?.templateId],
  );

  const postBet = useCallback(async () => {
    if (!roomId || !reviewPayload) return;

    const expiresAt = new Date(
      Date.now() + EXPIRY_PRESETS[reviewPayload.expiryIndex].offsetMs,
    ).toISOString();

    try {
      setSheetError(null);
      setIsPosting(true);
      await createBet.mutateAsync({
        p_room_id: roomId,
        p_question: reviewPayload.finalQuestion,
        p_options: [...BINARY_OPTIONS],
        p_stake: reviewPayload.stake,
        p_expires_at: expiresAt,
        p_template_id: reviewPayload.templateId,
        p_subject_display_name: reviewPayload.subjectDisplayName,
      });
      setReviewOpen(false);
      setReviewPayload(null);
      router.replace(`/(tabs)/rooms/${roomId}`);
    } catch (err) {
      setSheetError(getRpcErrorMessage(err));
    } finally {
      setIsPosting(false);
    }
  }, [roomId, reviewPayload, createBet, router]);

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
              <FlatList
                horizontal
                data={members ?? []}
                keyExtractor={(item) => item.id}
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-3"
                renderItem={({ item }) => {
                  const selected = item.user_id === selectedMemberId;
                  const name = memberDisplayName(item);
                  return (
                    <TouchableOpacity
                      onPress={() => {
                        form.setErrorMap({});
                        setSelectedMemberId(item.user_id);
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
          </View>

          {/* Templates */}
          <View className="mb-4">
            <Text className="mb-3 text-base font-semibold text-white">Choose a bet</Text>
            {templatesLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <FlatList
                data={templates ?? []}
                numColumns={2}
                scrollEnabled={false}
                keyExtractor={(item) => item.id}
                columnWrapperStyle={{ gap: 12, marginBottom: 12 }}
                renderItem={({ item }) => {
                  const selected = selectedTemplateId === item.id;
                  return (
                    <TouchableOpacity
                      onPress={() => selectTemplate(item)}
                      disabled={!sessionActive}
                      className={`min-h-[132px] flex-1 items-center justify-center rounded-2xl border-2 px-3 py-4 ${
                        selected ? 'border-primary bg-primary/15' : 'border-border bg-surface'
                      }`}
                      activeOpacity={0.8}
                      style={{ maxWidth: '48%', flexGrow: 1, flexBasis: '48%' }}
                    >
                      <BetTemplateIcon slug={item.slug} color={colors.primary} size={40} />
                      <Text className="mt-3 text-center text-base font-bold text-white">
                        {item.short_label}
                      </Text>
                      <Text className="mt-1 text-center text-xs text-text-secondary">Yes / No</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <TouchableOpacity
              onPress={openWriteIn}
              disabled={!sessionActive}
              className={`mt-1 min-h-[72px] flex-row items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-3 ${
                writeInOpen && !selectedTemplateId
                  ? 'border-primary bg-primary/10'
                  : 'border-border'
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
          </View>

          {/* Stake */}
          <View className="mb-5">
            <Text className="mb-2 text-base font-semibold text-white">Stake</Text>
            <View className="flex-row items-center rounded-2xl border-2 border-border bg-surface px-2 py-1">
              <View className="min-w-0 flex-1">
                <form.AppField
                  name="stake"
                  validators={{
                    onSubmit: ({ value }) => {
                      const n = parseInt(value.replace(/\D/g, ''), 10);
                      if (!Number.isFinite(n) || n <= 0) {
                        return 'Enter a positive stake (whole chips)';
                      }
                      return undefined;
                    },
                  }}
                >
                  {(field) => (
                    <field.TextField
                      leftIcon={<Coins size={22} color={colors.primary} weight="fill" />}
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
            <View className="flex-row flex-wrap gap-2">
              {EXPIRY_PRESETS.map((preset, i) => {
                const selected = expiryIndex === i;
                return (
                  <TouchableOpacity
                    key={preset.label}
                    onPress={() => setExpiryIndex(i)}
                    disabled={!sessionActive}
                    className={`min-h-[48px] min-w-[68px] items-center justify-center rounded-2xl border-2 px-3 ${
                      selected ? 'border-primary bg-primary/15' : 'border-border bg-surface'
                    }`}
                    activeOpacity={0.75}
                  >
                    <Text
                      className={`text-sm font-bold ${selected ? 'text-primary' : 'text-text-secondary'}`}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button
                size="lg"
                loading={isSubmitting}
                disabled={!sessionActive}
                onPress={() => {
                  if (!sessionActive) return;
                  void form.handleSubmit();
                }}
              >
                Review and Post
              </Button>
            )}
          </form.Subscribe>
        </ScrollView>

        <Modal visible={reviewOpen} animationType="slide" transparent onRequestClose={closeReview}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <Pressable
              className="flex-1 justify-end bg-black/65"
              onPress={closeReview}
              disabled={isPosting}
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
                    disabled={isPosting}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <X size={26} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {sheetError ? (
                  <View className="mb-4 rounded-xl bg-error/10 px-4 py-3">
                    <Text className="text-center text-base text-error">{sheetError}</Text>
                  </View>
                ) : null}

                <View className="mb-4 flex-row items-center gap-3">
                  <Avatar
                    uri={selectedMember?.profiles?.avatar_url}
                    fallback={displayName}
                    size="lg"
                  />
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-text-secondary">Player</Text>
                    <Text className="text-lg font-semibold text-white">{displayName}</Text>
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
                    {reviewPayload
                      ? EXPIRY_PRESETS[reviewPayload.expiryIndex].label
                      : EXPIRY_PRESETS[expiryIndex].label}
                  </Text>
                </View>

                <Button onPress={postBet} loading={isPosting}>
                  Post Bet to Room
                </Button>
              </Pressable>
            </Pressable>
          </GestureHandlerRootView>
        </Modal>
      </form.AppForm>
    </Pressable>
  );
}
