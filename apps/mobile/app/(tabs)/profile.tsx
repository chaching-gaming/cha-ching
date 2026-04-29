import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CaretRight, SignOut } from 'phosphor-react-native';
import * as ImagePicker from 'expo-image-picker';

import { useProfile, useUpdateProfile } from '@/hooks/use-profile';
import { useAuth } from '@/providers/auth';
import { usePreferences } from '@/providers/preferences';
import { useRooms, type RoomWithMembership } from '@/hooks/use-rooms';
import { uploadAvatar } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { Avatar, Button } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { ScreenHeader } from '@/components/ui/screen-header';
import { colors } from '@/constants/colors';

type ThemePreference = 'dark' | 'light' | 'system';

const THEME_OPTIONS: { key: ThemePreference; label: string }[] = [
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
  { key: 'system', label: 'System' },
];

type RoleBadge = { variant: 'admin' | 'player' | 'attestor'; label: string };

const ROLE_BADGES: Record<string, RoleBadge> = {
  ADMIN: { variant: 'admin', label: 'Admin' },
  PLAYER: { variant: 'player', label: 'Player' },
  ATTESTOR: { variant: 'attestor', label: 'Attestor' },
};

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 mt-6 px-1 text-xs font-semibold uppercase tracking-widest text-text-muted">
      {children}
    </Text>
  );
}

function SettingsCardRow({
  label,
  subtitle,
  trailing,
  isLast,
}: {
  label: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center justify-between px-4 py-4 ${isLast ? '' : 'border-b border-border'}`}
    >
      <View className="min-w-0 flex-1 pr-3">
        <Text className="text-base font-semibold text-white">{label}</Text>
        {subtitle ? (
          <Text className="mt-0.5 text-sm text-text-secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View>{trailing}</View> : null}
    </View>
  );
}

function ThemeSegmented({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (v: ThemePreference) => void;
}) {
  return (
    <View className="flex-row gap-1 rounded-xl bg-surface-light p-1">
      {THEME_OPTIONS.map((opt) => {
        const active = opt.key === value;
        return (
          <TouchableOpacity
            key={opt.key}
            onPress={() => onChange(opt.key)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`items-center justify-center rounded-lg px-3 py-1.5 ${active ? 'bg-primary' : ''}`}
          >
            <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-text-secondary'}`}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function RoomRow({
  item,
  isLast,
  onPress,
}: {
  item: RoomWithMembership;
  isLast: boolean;
  onPress: () => void;
}) {
  const badge = ROLE_BADGES[item.role ?? ''];
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      className={`flex-row items-center gap-3 px-4 py-4 ${isLast ? '' : 'border-b border-border'}`}
    >
      <Text className="flex-1 text-base font-semibold text-white" numberOfLines={1}>
        {item.room.name}
      </Text>
      {badge ? (
        <Badge
          variant={badge.variant}
          label={badge.label}
          className="px-2.5 py-0.5"
          labelClassName="text-xs font-bold"
        />
      ) : null}
      <CaretRight size={16} color={colors.textMuted} weight="bold" />
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const { data: historyRooms } = useRooms('history');

  const [displayName, setDisplayName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const {
    soundEnabled,
    hapticsEnabled,
    notificationsEnabled,
    setSoundEnabled,
    setHapticsEnabled,
    setNotificationsEnabled,
    isHydrated,
  } = usePreferences();

  // Still local stub — theme wiring is a separate task.
  const [theme, setTheme] = useState<ThemePreference>('dark');

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
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  const displayedName = profile?.display_name ?? 'Set your name';
  const email = profile?.email ?? session?.user.email ?? '';

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Profile" />
      <ScrollView contentContainerClassName="pb-12">
        {/* Avatar + identity */}
        <View className="items-center px-5 pt-2">
          <Avatar
            uri={profile?.avatar_url}
            fallback={profile?.display_name ?? profile?.email}
            size="xl"
            onPress={handlePickAvatar}
            showEditBadge={!uploading}
          />
          {uploading ? (
            <ActivityIndicator size="small" color={colors.primary} className="mt-2" />
          ) : null}

          {isEditing ? (
            <View className="mt-4 w-full items-center gap-3">
              <TextInput
                className="min-h-[48px] w-full rounded-xl border border-border bg-surface-light px-4 py-3.5 text-center text-base text-white"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Display Name"
                placeholderTextColor={colors.textMuted}
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
            <>
              <TouchableOpacity onPress={startEditing} className="mt-3" activeOpacity={0.7}>
                <Text className="text-2xl font-bold text-white">{displayedName}</Text>
              </TouchableOpacity>
              {email ? <Text className="mt-1 text-sm text-text-secondary">{email}</Text> : null}
            </>
          )}
        </View>

        {/* Settings */}
        <View className="px-5">
          <SectionLabel>Settings</SectionLabel>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            <SettingsCardRow
              label="Sound Effects"
              trailing={
                <Switch
                  value={soundEnabled}
                  onValueChange={setSoundEnabled}
                  disabled={!isHydrated}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor="#ffffff"
                  ios_backgroundColor={colors.border}
                />
              }
            />
            <SettingsCardRow
              label="Haptics"
              trailing={
                <Switch
                  value={hapticsEnabled}
                  onValueChange={setHapticsEnabled}
                  disabled={!isHydrated}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor="#ffffff"
                  ios_backgroundColor={colors.border}
                />
              }
            />
            <SettingsCardRow
              label="Notifications"
              trailing={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={setNotificationsEnabled}
                  disabled={!isHydrated}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor="#ffffff"
                  ios_backgroundColor={colors.border}
                />
              }
            />
            <SettingsCardRow
              label="Theme"
              trailing={<ThemeSegmented value={theme} onChange={setTheme} />}
              isLast
            />
          </View>
        </View>

        {/* Your rooms — past only */}
        <View className="px-5">
          <SectionLabel>Past Rooms</SectionLabel>
          {!historyRooms?.length ? (
            <View className="rounded-2xl border border-border bg-surface px-4 py-6">
              <Text className="text-center text-base text-text-secondary">No past rooms yet.</Text>
            </View>
          ) : (
            <View className="overflow-hidden rounded-2xl border border-border bg-surface">
              {historyRooms.map((item, idx) => (
                <RoomRow
                  key={item.room.id}
                  item={item}
                  isLast={idx === historyRooms.length - 1}
                  onPress={() => router.push(`/(tabs)/rooms/${item.room.id}`)}
                />
              ))}
            </View>
          )}
        </View>

        {/* Sign out */}
        <View className="mt-8 px-5">
          <TouchableOpacity
            className="min-h-[44px] flex-row items-center justify-center gap-2 rounded-xl border border-error px-6 py-3.5"
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <SignOut size={20} color={colors.error} />
            <Text className="text-base font-semibold text-error">Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
