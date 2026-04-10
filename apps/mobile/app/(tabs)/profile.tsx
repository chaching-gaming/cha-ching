import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarBlank, ClockCounterClockwise, SignOut } from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useProfile, useUpdateProfile } from '@/hooks/use-profile';
import { useAuth } from '@/providers/auth';
import { useRooms } from '@/hooks/use-rooms';
import { uploadAvatar } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { Avatar, Button } from '@/components/ui';
import { Card } from '@/components/ui/card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { colors } from '@/constants/colors';

function formatSessionDate(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ProfileScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const { data: historySessions } = useRooms('history');

  const [displayName, setDisplayName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);

  function startEditing() {
    setDisplayName(profile?.display_name ?? '');
    setIsEditing(true);
  }

  async function handleSave() {
    try {
      await updateProfile.mutateAsync({ display_name: displayName });
      setIsEditing(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update profile';
      Alert.alert('Error', message);
    }
  }

  async function handlePickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;
    if (!session?.user.id) return;

    try {
      setUploading(true);
      const publicUrl = await uploadAvatar(session.user.id, result.assets[0].uri);
      await updateProfile.mutateAsync({ avatar_url: publicUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload avatar';
      Alert.alert('Error', message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Error', error.message);
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Profile" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#22C55E" />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Profile" />
      <ScrollView className="flex-1" contentContainerClassName="items-center px-6 pt-4 pb-12">
        <Avatar
          uri={profile?.avatar_url}
          fallback={profile?.display_name ?? profile?.email}
          size="lg"
          onPress={handlePickAvatar}
          showEditBadge={!uploading}
        />

        {uploading && <ActivityIndicator size="small" color="#22C55E" className="mt-2" />}

        <Text className="mt-3 text-sm text-text-muted">
          {profile?.email ?? session?.user.email}
        </Text>

        {isEditing ? (
          <View className="mt-4 w-full items-center gap-3">
            <TextInput
              className="w-full rounded-xl border border-border bg-surface-light px-4 py-3 text-center text-base text-white"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Display Name"
              placeholderTextColor="#64748B"
              autoFocus
            />
            <Button onPress={handleSave} loading={updateProfile.isPending} className="w-full">
              Save
            </Button>
            <TouchableOpacity
              onPress={() => setIsEditing(false)}
              className="min-h-[44px] items-center justify-center"
            >
              <Text className="text-sm text-text-muted">Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={startEditing} className="mt-2 flex-row items-center gap-2">
            <Text className="text-xl font-semibold text-white">
              {profile?.display_name ?? 'Set your name'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Session History */}
        <View className="mt-10 w-full">
          <View className="mb-3 flex-row items-center gap-2">
            <ClockCounterClockwise size={20} color={colors.textSecondary} />
            <Text className="text-lg font-semibold text-white">Past Rooms</Text>
          </View>

          {!historySessions?.length ? (
            <Text className="text-sm text-text-muted">No completed rooms yet.</Text>
          ) : (
            historySessions.map((item) => (
              <TouchableOpacity
                key={item.room.id}
                onPress={() => router.push(`/(tabs)/rooms/${item.room.id}`)}
                activeOpacity={0.7}
              >
                <Card className="mb-2">
                  <Text className="text-base font-medium text-white">{item.room.name}</Text>
                  <View className="mt-1 flex-row items-center gap-1">
                    <CalendarBlank size={12} color={colors.textMuted} />
                    <Text className="text-xs text-text-muted">
                      {formatSessionDate(item.room.session_date)}
                    </Text>
                  </View>
                </Card>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View className="mt-8 w-full">
          <TouchableOpacity
            className="min-h-[44px] flex-row items-center justify-center gap-2 rounded-xl border border-error px-6 py-3.5"
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <SignOut size={20} color="#EF4444" />
            <Text className="text-base font-semibold text-error">Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
