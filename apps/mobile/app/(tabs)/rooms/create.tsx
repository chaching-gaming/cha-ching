import { useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Info } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Button } from '@/components/ui/button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useCreateRoom } from '@/hooks/use-rooms';

const CHIP_LIMIT_OPTIONS = [
  { label: '-1,000', value: -1000 },
  { label: '-5,000', value: -5000 },
  { label: 'No Limit', value: null },
] as const;

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
  const [name, setName] = useState('');
  const [selectedChipLimit, setSelectedChipLimit] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const today = todayDateString();
  const trimmedName = name.trim();
  const roomName = trimmedName
    ? `${trimmedName} - ${formatDatePreview(today)}`
    : '';

  async function handleCreate() {
    if (!trimmedName) {
      setError('Room name is required');
      return;
    }
    try {
      setError(null);
      setIsSubmitting(true);
      const room = await createRoom.mutateAsync({
        p_name: trimmedName,
        p_session_date: today,
        p_chip_limit: selectedChipLimit,
      });
      router.replace(`/(tabs)/rooms/invite?id=${room.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create room';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

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

        {error ? (
          <View className="mb-4 items-center rounded-xl bg-error/10 px-3 py-3">
            <Text className="text-sm text-error">{error}</Text>
          </View>
        ) : null}

        {/* Room name */}
        <View className="mb-4">
          <Text className="mb-1 text-sm font-medium text-white">Room Name *</Text>
          <TextInput
            className="rounded-xl border border-border bg-surface px-4 py-3 text-base text-white"
            value={name}
            onChangeText={(text) => { setName(text); setError(null); }}
            placeholder="e.g. Sunday Golf"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
          />
          {roomName ? (
            <Text className="mt-1 text-xs text-text-muted">
              Preview: {roomName}
            </Text>
          ) : null}
        </View>

        {/* Per-User Chip Limit selector */}
        <View className="mb-4">
          <Text className="mb-1 text-sm font-medium text-white">Per-User Chip Limit</Text>
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

        <Button onPress={handleCreate} loading={isSubmitting}>
          Create Room
        </Button>
      </ScrollView>
    </Pressable>
  );
}
