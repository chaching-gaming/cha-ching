import { useState, useCallback, useRef } from 'react';
import { ActivityIndicator, Share, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Check, Copy, Users } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useRoomDetail, useRoomMembers } from '@/hooks/use-rooms';

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: room, isLoading: roomLoading } = useRoomDetail(id);
  const { data: members } = useRoomMembers(id);

  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const inviteCode = room?.invite_code ?? '';
  const formattedCode =
    inviteCode.length === 6 ? `${inviteCode.slice(0, 3)}-${inviteCode.slice(3)}` : inviteCode;

  const shareMessage = `Join my room "${room?.name}" on Cha-Ching! Use invite code: ${inviteCode}`;

  const handleCopyCode = useCallback(async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [inviteCode]);

  async function handleShare() {
    if (!room) return;
    await Share.share({ message: shareMessage });
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
        <Text className="text-base text-text-secondary">Room not found</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Invite Friends" showBack showHome />

      <View className="flex-1 items-center px-5 pt-4">
        {/* Room name & member count */}
        <Text
          className="text-center text-lg font-semibold text-white"
          numberOfLines={1}
          style={{ maxWidth: '100%' }}
        >
          {room.name}
        </Text>
        <View className="mt-1 mb-8 flex-row items-center gap-1">
          <Users size={14} color={colors.textMuted} />
          <Text className="text-sm text-text-muted">
            {members?.length ?? 1} {(members?.length ?? 1) === 1 ? 'member' : 'members'}
          </Text>
        </View>

        {/* QR Code */}
        <View className="mb-3 rounded-2xl bg-white p-6">
          <QRCode value={inviteCode} size={200} color="#0B1120" backgroundColor="white" />
        </View>
        <Text className="mb-8 text-center text-sm text-text-muted">
          Scan this QR code to join the room
        </Text>

        {/* Invite code card */}
        <Card className="mb-6 w-full">
          <Text className="mb-1 text-xs font-medium tracking-wider text-text-muted">
            INVITE CODE
          </Text>
          <View className="flex-row items-center justify-between">
            <Text className="text-2xl font-bold tracking-[6px] text-white">{formattedCode}</Text>
            <TouchableOpacity
              onPress={handleCopyCode}
              className={`h-10 w-10 items-center justify-center rounded-lg ${copied ? 'bg-primary/20' : 'bg-primary/10'}`}
              activeOpacity={0.7}
            >
              {copied ? (
                <Check size={20} color={colors.primary} weight="bold" />
              ) : (
                <Copy size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>
        </Card>

        {/* Share button */}
        <View className="w-full">
          <Button onPress={handleShare}>Share Invite</Button>
        </View>
      </View>
    </View>
  );
}
