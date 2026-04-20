import { useCallback, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
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
  DownloadSimple,
  PencilSimple,
  Plus,
  Prohibit,
  Receipt,
  SignOut,
} from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Badge } from '@/components/ui/badge';
import { ScreenHeader } from '@/components/ui/screen-header';
import { MemberRow } from '@/components/activity/member-row';
import { SetChipLimitSheet } from '@/components/activity/set-chip-limit-sheet';
import { useAuth } from '@/providers/auth';
import {
  getRpcErrorMessage,
  useEndSession,
  useRemoveMember,
  useRoomDetail,
  useRoomMembers,
  useUpdateMemberRole,
} from '@/hooks/use-rooms';

function promptMemberRole(
  displayName: string,
  onPick: (role: 'PLAYER' | 'ATTESTOR' | 'ADMIN') => void,
) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Cancel', 'Player', 'Attestor', 'Admin'],
        cancelButtonIndex: 0,
      },
      (buttonIndex) => {
        if (buttonIndex === 1) onPick('PLAYER');
        if (buttonIndex === 2) onPick('ATTESTOR');
        if (buttonIndex === 3) onPick('ADMIN');
      },
    );
  } else {
    Alert.alert(`Change role: ${displayName}`, undefined, [
      { text: 'Player', onPress: () => onPick('PLAYER') },
      { text: 'Attestor', onPress: () => onPick('ATTESTOR') },
      { text: 'Admin', onPress: () => onPick('ADMIN') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
}

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
      <Text className="text-base font-semibold text-white">{label}</Text>
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
          className={`text-base font-bold ${destructive ? 'text-error' : 'text-white'}`}
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
  const { data: members } = useRoomMembers(id);

  const endSession = useEndSession();
  const updateMemberRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();

  const currentMember = members?.find((m) => m.user_id === authSession?.user.id);
  const isAdmin = currentMember?.role === 'ADMIN';
  const isActive = room?.is_active ?? false;

  const [chipLimitSheetOpen, setChipLimitSheetOpen] = useState(false);

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
      const targetName = target?.profiles?.display_name ?? 'Member';

      promptMemberRole(targetName, async (newRole) => {
        if (target?.role === newRole) return;
        try {
          await updateMemberRole.mutateAsync({
            p_room_id: id,
            p_target_user_id: userId,
            p_new_role: newRole,
          });
        } catch (err) {
          Alert.alert('Error', getRpcErrorMessage(err));
        }
      });
    },
    [id, members, updateMemberRole],
  );

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

  const chipLimitValue =
    room.per_user_chip_limit != null ? room.per_user_chip_limit.toLocaleString('en-US') : 'None';

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Room Settings" showBack titleClassName="text-xl font-bold text-white" />

      <ScrollView contentContainerClassName="pb-12">
        {/* Room settings */}
        <View className="px-5">
          <SectionLabel>Room settings</SectionLabel>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            <SettingsRow label="Room Name" value={room.name} />
            <SettingsRow
              label="Chip Limit"
              value={chipLimitValue}
              valueClassName={
                room.per_user_chip_limit != null && room.per_user_chip_limit < 0
                  ? 'text-error'
                  : 'text-text-secondary'
              }
              rightIcon={
                isAdmin && isActive ? (
                  <PencilSimple size={18} color={colors.textMuted} weight="bold" />
                ) : undefined
              }
              onPress={isAdmin && isActive ? () => setChipLimitSheetOpen(true) : undefined}
            />
            <SettingsRow
              label="Invite Code"
              value={room.invite_code ?? '—'}
              valueClassName="text-primary"
              rightIcon={<Copy size={18} color={colors.primary} weight="bold" />}
              onPress={room.invite_code ? handleCopyInviteCode : undefined}
            />
          </View>
        </View>

        {/* Admin actions (admin only) */}
        {isAdmin ? (
          <View className="px-5">
            <SectionLabel>Admin actions</SectionLabel>
            <View className="overflow-hidden rounded-2xl border border-border bg-surface">
              <AdminActionRow
                icon={<Prohibit size={20} color={colors.error} weight="bold" />}
                tint="error"
                label="Void a Bet"
                subtitle="Return chips to all parties"
                comingSoon
              />
              <AdminActionRow
                icon={<Receipt size={20} color={colors.primary} weight="bold" />}
                tint="primary"
                label="View Wager Ledger"
                subtitle="All bets and transactions"
                comingSoon
              />
              <AdminActionRow
                icon={<DownloadSimple size={20} color={colors.warning} weight="bold" />}
                tint="warning"
                label="Export as CSV"
                subtitle="Download bets and ledger"
                comingSoon
              />
            </View>
          </View>
        ) : null}

        {/* Members */}
        <View className="px-5">
          <SectionLabel>{`Members (${members?.length ?? 0})`}</SectionLabel>
          <View className="overflow-hidden rounded-2xl border border-border bg-surface">
            {(members ?? []).map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isAdmin={isAdmin}
                isActive={isActive}
                currentUserId={authSession?.user.id}
                onChangeRole={handleChangeRoleRequest}
                onRemoveMember={handleRemoveMemberRequest}
              />
            ))}
            {isActive ? (
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

        {/* Danger zone: end session */}
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
      </ScrollView>

      {isAdmin && isActive ? (
        <SetChipLimitSheet
          visible={chipLimitSheetOpen}
          onClose={() => setChipLimitSheetOpen(false)}
          roomId={id}
          currentLimit={room.per_user_chip_limit}
        />
      ) : null}
    </View>
  );
}
