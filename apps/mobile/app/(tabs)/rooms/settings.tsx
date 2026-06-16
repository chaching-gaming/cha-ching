import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  CaretRight,
  Copy,
  Crown,
  Gavel,
  Plus,
  Receipt,
  SignOut,
  Trophy,
  User,
} from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { ActionSheet, type ActionSheetOption } from '@/components/ui/action-sheet';
import { Badge } from '@/components/ui/badge';
import { ScreenHeader } from '@/components/ui/screen-header';
import { MemberRow } from '@/components/activity/member-row';
import { useAuth } from '@/providers/auth';
import {
  getRpcErrorMessage,
  useEndSession,
  useLeaveRoom,
  useRemoveMember,
  useRoomDetail,
  useRoomMembersWithHistory,
  useUpdateMemberRole,
} from '@/hooks/use-rooms';

type MemberRole = 'PLAYER' | 'ATTESTOR' | 'ADMIN';

type RoleSheetTarget = {
  userId: string;
  name: string;
  currentRole: MemberRole | null;
};

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 mt-6 px-1 text-xs font-semibold uppercase tracking-widest text-text-muted">
      {children}
    </Text>
  );
}

function SettingsRow({
  label,
  value,
  valueClassName,
  rightIcon,
  onPress,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  rightIcon?: React.ReactNode;
  onPress?: () => void;
}) {
  const trailing =
    rightIcon ?? (onPress ? <CaretRight size={18} color={colors.textMuted} weight="bold" /> : null);
  const content = (
    <View className="flex-row items-center justify-between border-b border-border px-4 py-4">
      <Text className="text-base font-semibold text-text-primary">{label}</Text>
      <View className="flex-row items-center gap-2">
        <Text
          className={`text-base font-semibold ${valueClassName ?? 'text-text-secondary'}`}
          numberOfLines={1}
        >
          {value}
        </Text>
        {trailing}
      </View>
    </View>
  );
  if (!onPress) return content;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      {content}
    </TouchableOpacity>
  );
}

function AdminActionRow({
  icon,
  tint,
  label,
  subtitle,
  comingSoon,
  destructive,
  onPress,
}: {
  icon: React.ReactNode;
  tint: 'primary' | 'warning' | 'error';
  label: string;
  subtitle: string;
  comingSoon?: boolean;
  destructive?: boolean;
  onPress?: () => void;
}) {
  const tintBg =
    tint === 'primary' ? 'bg-primary/15' : tint === 'warning' ? 'bg-warning/15' : 'bg-error/15';
  const disabled = comingSoon || !onPress;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      className={`flex-row items-center gap-3 border-b border-border px-4 py-3.5 ${disabled ? 'opacity-60' : ''}`}
    >
      <View className={`h-10 w-10 items-center justify-center rounded-full ${tintBg}`}>{icon}</View>
      <View className="min-w-0 flex-1">
        <Text
          className={`text-base font-bold ${destructive ? 'text-error' : 'text-text-primary'}`}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text className="text-sm text-text-secondary" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {comingSoon ? (
        <Badge
          variant="default"
          label="Soon"
          className="px-2 py-1"
          labelClassName="text-[10px] font-bold tracking-wide"
        />
      ) : destructive ? null : (
        <CaretRight size={18} color={colors.textMuted} weight="bold" />
      )}
    </TouchableOpacity>
  );
}

export default function RoomSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session: authSession } = useAuth();

  const { data: room, isLoading: roomLoading } = useRoomDetail(id);
  const { data: members } = useRoomMembersWithHistory(id);

  // Split members into active and past groups
  const activeMembers = members?.filter((m) => m.membershipStatus === 'active') ?? [];
  const pastMembers = members?.filter((m) => m.membershipStatus !== 'active') ?? [];

  const endSession = useEndSession();
  const updateMemberRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const leaveRoom = useLeaveRoom();

  const currentMember = members?.find((m) => m.user_id === authSession?.user.id);
  const isCurrentUserActiveMember = currentMember?.membershipStatus === 'active';
  const isAdmin = currentMember?.role === 'ADMIN' && isCurrentUserActiveMember;
  const isActive = room?.is_active ?? false;

  const [roleSheetTarget, setRoleSheetTarget] = useState<RoleSheetTarget | null>(null);

  const handleCopyInviteCode = useCallback(async () => {
    if (!room?.invite_code) return;
    await Clipboard.setStringAsync(room.invite_code);
    Alert.alert('Copied', 'Invite code copied to clipboard.');
  }, [room?.invite_code]);

  const handleEndSession = useCallback(() => {
    Alert.alert('End Session', 'Are you sure? This will prevent new joins and bets.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Session',
        style: 'destructive',
        onPress: async () => {
          try {
            await endSession.mutateAsync({ p_room_id: id });
          } catch (err) {
            Alert.alert('Error', getRpcErrorMessage(err));
          }
        },
      },
    ]);
  }, [endSession, id]);

  const handleChangeRoleRequest = useCallback(
    (userId: string) => {
      const target = members?.find((m) => m.user_id === userId);
      setRoleSheetTarget({
        userId,
        name: target?.profiles?.display_name ?? 'Member',
        currentRole: (target?.role as MemberRole | undefined) ?? null,
      });
    },
    [members],
  );

  const performChangeRole = useCallback(
    async (userId: string, newRole: MemberRole) => {
      try {
        await updateMemberRole.mutateAsync({
          p_room_id: id,
          p_target_user_id: userId,
          p_new_role: newRole,
        });
      } catch (err) {
        Alert.alert('Error', getRpcErrorMessage(err));
      }
    },
    [id, updateMemberRole],
  );

  const roleOptions = useMemo<ActionSheetOption[]>(() => {
    if (!roleSheetTarget) return [];
    const pick = (role: MemberRole) => {
      if (roleSheetTarget.currentRole === role) return;
      void performChangeRole(roleSheetTarget.userId, role);
    };
    return [
      {
        key: 'PLAYER',
        label: 'Player',
        subtitle: 'Places and accepts bets',
        icon: <User size={22} color={colors.textSecondary} weight="bold" />,
        onPress: () => pick('PLAYER'),
      },
      {
        key: 'ATTESTOR',
        label: 'Attestor',
        subtitle: 'Can settle bets and resolve disputes',
        icon: <Gavel size={22} color={colors.warning} weight="bold" />,
        onPress: () => pick('ATTESTOR'),
      },
      {
        key: 'ADMIN',
        label: 'Admin',
        subtitle: 'Full control of the room',
        icon: <Crown size={22} color={colors.primary} weight="bold" />,
        onPress: () => pick('ADMIN'),
      },
    ];
  }, [roleSheetTarget, performChangeRole]);

  const handleRemoveMemberRequest = useCallback(
    (userId: string) => {
      const target = members?.find((m) => m.user_id === userId);
      const targetName = target?.profiles?.display_name ?? 'this member';

      Alert.alert(
        'Remove member',
        `Remove ${targetName} from this session? They will lose access to the room.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              try {
                await removeMember.mutateAsync({ p_room_id: id, p_target_user_id: userId });
              } catch (err) {
                Alert.alert('Error', getRpcErrorMessage(err));
              }
            },
          },
        ],
      );
    },
    [id, members, removeMember],
  );

  const handleLeaveRoom = useCallback(() => {
    Alert.alert(
      'Leave Room',
      'Are you sure you want to leave this room? Your chip balance will be preserved if you rejoin later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveRoom.mutateAsync({ p_room_id: id });
              router.replace('/(tabs)/rooms');
            } catch (err) {
              Alert.alert('Error', getRpcErrorMessage(err));
            }
          },
        },
      ],
    );
  }, [id, leaveRoom, router]);

  const handleMemberPress = useCallback(
    (userId: string) => {
      router.push(`/(tabs)/rooms/member/${userId}?roomId=${id}`);
    },
    [id, router],
  );

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

  const startingChipsValue = (room.starting_chips ?? 1000).toLocaleString('en-US');

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Room Settings" showBack showHome titleClassName="text-xl font-bold text-text-primary" />

      <ScrollView contentContainerClassName="pb-12">
        {/* Room settings */}
        <View className="px-5">
          <SectionLabel>Room settings</SectionLabel>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            <SettingsRow label="Room Name" value={room.name} />
            <SettingsRow label="Starting Chips" value={startingChipsValue} />
            {/* Only show invite code for active members */}
            {isCurrentUserActiveMember ? (
              <SettingsRow
                label="Invite Code"
                value={room.invite_code ?? '—'}
                valueClassName="text-primary"
                rightIcon={<Copy size={18} color={colors.primary} weight="bold" />}
                onPress={room.invite_code ? handleCopyInviteCode : undefined}
              />
            ) : null}
          </View>
        </View>

        {/* View — per-room read-only surfaces, visible to every member */}
        <View className="px-5">
          <SectionLabel>View</SectionLabel>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            <AdminActionRow
              icon={<Trophy size={20} color={colors.primary} weight="fill" />}
              tint="primary"
              label="Standings"
              subtitle="Chip leaderboard"
              onPress={() => router.push(`/(tabs)/rooms/standings?id=${id}`)}
            />
          </View>
        </View>

        {/* Admin actions (admin only) */}
        {isAdmin ? (
          <View className="px-5">
            <SectionLabel>Admin actions</SectionLabel>
            <View className="overflow-hidden rounded-2xl border border-border bg-surface">
              <AdminActionRow
                icon={<Receipt size={20} color={colors.primary} weight="bold" />}
                tint="primary"
                label="View Wager Ledger"
                subtitle="All entries, with CSV export"
                onPress={() => router.push(`/(tabs)/rooms/ledger?id=${id}`)}
              />
            </View>
          </View>
        ) : null}

        {/* Active Members */}
        <View className="px-5">
          <SectionLabel>{`Members (${activeMembers.length})`}</SectionLabel>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {activeMembers.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isAdmin={isAdmin}
                isActive={isActive}
                currentUserId={authSession?.user.id}
                membershipStatus={member.membershipStatus}
                onChangeRole={handleChangeRoleRequest}
                onRemoveMember={handleRemoveMemberRequest}
                onMemberPress={handleMemberPress}
              />
            ))}
            {isActive && isCurrentUserActiveMember ? (
              <TouchableOpacity
                onPress={() => router.push(`/(tabs)/rooms/invite?id=${id}`)}
                activeOpacity={0.75}
                className="flex-row items-center gap-3 px-4 py-3.5"
                accessibilityLabel="Add member"
              >
                <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/15">
                  <Plus size={20} color={colors.primary} weight="bold" />
                </View>
                <Text className="flex-1 text-base font-bold text-primary">Add member</Text>
                <CaretRight size={18} color={colors.textMuted} weight="bold" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Past Members */}
        {pastMembers.length > 0 ? (
          <View className="px-5">
            <SectionLabel>{`Past Members (${pastMembers.length})`}</SectionLabel>
            <View className="overflow-hidden rounded-2xl border border-border bg-surface">
              {pastMembers.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isAdmin={isAdmin}
                  isActive={isActive}
                  currentUserId={authSession?.user.id}
                  membershipStatus={member.membershipStatus}
                  onChangeRole={handleChangeRoleRequest}
                  onRemoveMember={handleRemoveMemberRequest}
                  onMemberPress={handleMemberPress}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* Danger zone: end session (admin) or leave room (non-admin) */}
        {isAdmin && isActive ? (
          <View className="px-5">
            <SectionLabel>Danger zone</SectionLabel>
            <View className="overflow-hidden rounded-2xl border border-border bg-surface">
              <AdminActionRow
                icon={<SignOut size={20} color={colors.error} weight="bold" />}
                tint="error"
                label="End Session"
                subtitle="Lock the room from new bets"
                destructive
                onPress={handleEndSession}
              />
            </View>
          </View>
        ) : null}

        {/* Leave room (non-admin active members only) */}
        {!isAdmin && isCurrentUserActiveMember ? (
          <View className="px-5">
            <SectionLabel>Danger zone</SectionLabel>
            <View className="overflow-hidden rounded-2xl border border-border bg-surface">
              <AdminActionRow
                icon={<SignOut size={20} color={colors.error} weight="bold" />}
                tint="error"
                label="Leave Room"
                subtitle="Remove yourself from this room"
                destructive
                onPress={handleLeaveRoom}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>

      <ActionSheet
        visible={!!roleSheetTarget}
        onClose={() => setRoleSheetTarget(null)}
        title={roleSheetTarget ? `Change role · ${roleSheetTarget.name}` : undefined}
        options={roleOptions}
        selectedKey={roleSheetTarget?.currentRole}
      />
    </View>
  );
}
