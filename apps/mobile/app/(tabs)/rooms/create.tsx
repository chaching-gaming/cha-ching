import { Keyboard, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Info } from 'phosphor-react-native';
import { z } from 'zod';

import { colors } from '@/constants/colors';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useCreateRoom } from '@/hooks/use-rooms';
import { useForm } from '@/hooks/use-form';

const CHIP_LIMIT_OPTIONS = [
  { label: '-1,000', value: -1000 },
  { label: '-5,000', value: -5000 },
  { label: 'No Limit', value: null },
] as const;

const createRoomSchema = z.object({
  name: z.string().min(1, 'Room name is required'),
  chipLimit: z.number().nullable(),
});

function todayDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDatePreview(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function CreateRoomScreen() {
  const router = useRouter();
  const createRoom = useCreateRoom();
  const today = todayDateString();

  const form = useForm({
    defaultValues: {
      name: '',
      chipLimit: null as number | null,
    },
    validators: {
      onChange: createRoomSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const room = await createRoom.mutateAsync({
          p_name: value.name.trim(),
          p_session_date: today,
          p_chip_limit: value.chipLimit,
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
    <Pressable className="flex-1 bg-background" onPress={Keyboard.dismiss}>
      <ScreenHeader title="Create Room" showBack />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pt-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        {/* Create / Join toggle */}
        <View className="mb-6 flex-row rounded-xl bg-surface p-1">
          <View className="flex-1 items-center rounded-lg bg-primary py-2.5">
            <Text className="text-base font-semibold text-white">Create</Text>
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
              const preview = trimmed ? `${trimmed} - ${formatDatePreview(today)}` : '';
              return preview ? (
                <Text className="-mt-2.5 mb-4 text-sm text-text-secondary">Preview: {preview}</Text>
              ) : null;
            }}
          </form.Subscribe>

          <form.AppField name="chipLimit">
            {(field) => (
              <field.OptionField
                options={CHIP_LIMIT_OPTIONS}
                label="Per-user chip limit"
                description="Max chips a player can lose before being blocked from betting"
              />
            )}
          </form.AppField>

          {/* Admin info */}
          <View className="mb-6 flex-row items-center gap-3 rounded-xl border border-border bg-surface px-4 py-4">
            <Info size={22} color={colors.textMuted} />
            <Text className="flex-1 text-sm leading-5 text-text-secondary">
              {"You'll be the Admin of this room. You can invite members after creating it."}
            </Text>
          </View>

          <form.SubmitButton>Create Room</form.SubmitButton>
        </form.AppForm>
      </ScrollView>
    </Pressable>
  );
}
