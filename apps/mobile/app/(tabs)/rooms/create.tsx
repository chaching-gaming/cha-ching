import { useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Info } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useForm } from '@/hooks/use-form';
import { useCreateRoom } from '@/hooks/use-rooms';

const CHIP_LIMIT_OPTIONS = [
  { label: '-1,000', value: -1000 },
  { label: '-5,000', value: -5000 },
  { label: 'No Limit', value: null },
] as const;

export default function CreateRoomScreen() {
  const router = useRouter();
  const createRoom = useCreateRoom();
  const [selectedChipLimit, setSelectedChipLimit] = useState<number | null>(null);

  const form = useForm({
    defaultValues: {
      name: '',
      description: '',
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        const room = await createRoom.mutateAsync({
          p_name: value.name.trim(),
          p_description: value.description.trim() || null,
          p_chip_limit: selectedChipLimit,
        });

        console.log({ room });
        router.replace(`/(tabs)/rooms/${room.id}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create room';
        formApi.setErrorMap({ onSubmit: { form: message, fields: {} } });
      }
    },
  });

  return (
    <Pressable className="flex-1 bg-background" onPress={Keyboard.dismiss}>
      <ScreenHeader title="Create Room" showBack />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        {/* Create / Join toggle */}
        <View className="mb-6 flex-row rounded-xl bg-surface p-1">
          <View className="flex-1 items-center rounded-lg bg-primary py-2.5">
            <Text className="text-sm font-semibold text-white">Create</Text>
          </View>
          <TouchableOpacity
            className="flex-1 items-center rounded-lg py-2.5"
            onPress={() => router.replace('/(tabs)/rooms/join')}
            activeOpacity={0.7}
          >
            <Text className="text-sm font-medium text-text-secondary">Join</Text>
          </TouchableOpacity>
        </View>

        <form.AppForm>
          <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
            {(formError) =>
              formError ? (
                <View className="mb-4 items-center rounded-xl bg-error/10 px-3 py-3">
                  <Text className="text-sm text-error">
                    {typeof formError === 'string' ? formError : 'An error occurred'}
                  </Text>
                </View>
              ) : null
            }
          </form.Subscribe>

          <form.AppField
            name="name"
            validators={{
              onChange: ({ value }) => (!value.trim() ? 'Room name is required' : undefined),
            }}
          >
            {(field) => (
              <field.TextField
                label="Room Name *"
                placeholder="e.g. Sunday Golf Crew"
                autoCorrect={false}
              />
            )}
          </form.AppField>

          <form.AppField name="description">
            {(field) => (
              <field.TextField
                label="Description (optional)"
                placeholder="Weekly golf prop bets with the crew"
                multiline
                numberOfLines={4}
                style={{ minHeight: 100, textAlignVertical: 'top' }}
              />
            )}
          </form.AppField>

          {/* Chip Limit selector */}
          <View className="mb-4">
            <Text className="mb-1 text-sm font-medium text-white">Negative Chip Limit</Text>
            <Text className="mb-3 text-xs text-text-muted">
              Max chips a player can lose before being blocked from betting
            </Text>
            <View className="flex-row gap-3">
              {CHIP_LIMIT_OPTIONS.map((option) => {
                const isSelected = selectedChipLimit === option.value;
                return (
                  <TouchableOpacity
                    key={option.label}
                    onPress={() => setSelectedChipLimit(option.value)}
                    className={`flex-1 items-center rounded-xl border py-3 ${
                      isSelected ? 'border-primary bg-primary/10' : 'border-border bg-surface'
                    }`}
                    activeOpacity={0.7}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        isSelected ? 'text-primary' : 'text-text-secondary'
                      }`}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Admin info */}
          <View className="mb-6 flex-row items-center gap-2 rounded-xl bg-surface px-4 py-3">
            <Info size={18} color={colors.textMuted} />
            <Text className="flex-1 text-xs text-text-muted">
              {"You'll be the Admin of this room. You can invite members after creating it."}
            </Text>
          </View>

          <form.SubmitButton>Create Room</form.SubmitButton>
        </form.AppForm>
      </ScrollView>
    </Pressable>
  );
}
