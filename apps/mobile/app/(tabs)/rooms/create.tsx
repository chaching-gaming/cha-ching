import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Coins, Info, Timer } from 'phosphor-react-native';
import { z } from 'zod';

import { colors } from '@/constants/colors';
import { KeyboardAwareScrollView } from '@/components/form/keyboard-aware-scroll-view';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useCreateRoom } from '@/hooks/use-rooms';
import { useForm } from '@/hooks/use-form';
import { formatSessionDateShort, formatTodayCalendarDate } from '@/lib/date-format';

const createRoomSchema = z.object({
  name: z.string().min(1, 'Room name is required'),
  startingChips: z
    .string()
    .min(1, 'Starting chips is required')
    .refine((v) => parseInt(v, 10) >= 1, 'Must be at least 1')
    .refine((v) => parseInt(v, 10) <= 100000, 'Max 100,000 chips'),
  outcomeWindow: z
    .string()
    .min(1, 'Outcome window is required')
    .refine((v) => parseInt(v, 10) >= 10, 'Must be at least 10 seconds')
    .refine((v) => parseInt(v, 10) <= 300, 'Max 300 seconds (5 minutes)'),
});

export default function CreateRoomScreen() {
  const router = useRouter();
  const createRoom = useCreateRoom();
  const today = formatTodayCalendarDate();

  const form = useForm({
    defaultValues: {
      name: '',
      startingChips: '1000',
      outcomeWindow: '30',
    },
    validators: {
      onSubmit: createRoomSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const room = await createRoom.mutateAsync({
          p_name: value.name.trim(),
          p_session_date: today,
          p_starting_chips: parseInt(value.startingChips, 10),
          p_outcome_submission_window_seconds: parseInt(value.outcomeWindow, 10),
        });
        router.replace(`/(tabs)/rooms/invite?id=${room.id}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create room';
        formApi.setErrorMap({
          onSubmit: {
            fields: {},
            form: message,
          },
        });
      }
    },
  });

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Create Room" showBack />
      <KeyboardAwareScrollView contentContainerClassName="px-5 pt-4 pb-8">
        {/* Create / Join toggle */}
        <View className="mb-6 flex-row rounded-xl bg-surface p-1">
          <View className="flex-1 items-center rounded-lg bg-primary py-2.5">
            <Text className="text-base font-semibold text-background">Create</Text>
          </View>
          <TouchableOpacity
            className="flex-1 items-center rounded-lg py-2.5"
            onPress={() => router.replace('/(tabs)/rooms/join')}
            activeOpacity={0.7}
          >
            <Text className="text-base font-medium text-text-secondary">Join</Text>
          </TouchableOpacity>
        </View>

        <form.AppForm>
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

          <form.AppField name="name">
            {(field) => (
              <field.TextField
                label="Room name *"
                placeholder="e.g. Sunday Golf"
                autoCorrect={false}
              />
            )}
          </form.AppField>

          <form.Subscribe selector={(state) => state.values.name}>
            {(name) => {
              const trimmed = name.trim();
              const preview = trimmed ? `${trimmed} - ${formatSessionDateShort(today)}` : '';
              return preview ? (
                <Text className="-mt-2.5 mb-4 text-sm text-text-secondary">Preview: {preview}</Text>
              ) : null;
            }}
          </form.Subscribe>

          <form.AppField name="startingChips">
            {(field) => (
              <field.TextField
                label="Starting chips per player"
                placeholder="1000"
                keyboardType="number-pad"
                transformValue={(text) => text.replace(/\D/g, '').slice(0, 6)}
                leftIcon={<Coins size={20} color={colors.chipsIcon} weight="fill" />}
              />
            )}
          </form.AppField>

          <Text className="-mt-2.5 mb-4 text-sm text-text-secondary">
            Each player gets this many chips when joining the room
          </Text>

          <form.AppField name="outcomeWindow">
            {(field) => (
              <field.TextField
                label="Outcome submission window"
                placeholder="30"
                keyboardType="number-pad"
                transformValue={(text) => text.replace(/\D/g, '').slice(0, 3)}
                leftIcon={<Timer size={20} color={colors.textMuted} weight="bold" />}
              />
            )}
          </form.AppField>

          <Text className="-mt-2.5 mb-4 text-sm text-text-secondary">
            Time in seconds for participants to submit results after bet expires (10-300s)
          </Text>

          {/* Admin info */}
          <View className="mb-6 flex-row items-center gap-3 rounded-xl border border-border bg-surface px-4 py-4">
            <Info size={22} color={colors.textMuted} />
            <Text className="flex-1 text-sm leading-5 text-text-secondary">
              {"You'll be the Admin of this room. You can invite members after creating it."}
            </Text>
          </View>

          <form.SubmitButton>Create Room</form.SubmitButton>
        </form.AppForm>
      </KeyboardAwareScrollView>
    </View>
  );
}
