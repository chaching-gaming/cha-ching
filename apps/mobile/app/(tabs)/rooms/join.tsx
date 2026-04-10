import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Keyboard as KeyboardIcon, Users } from 'phosphor-react-native';

import { colors } from '@/constants/colors';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { supabase } from '@/lib/supabase';
import { useJoinRoom, parseJoinError } from '@/hooks/use-rooms';

const CODE_LENGTH = 6;

type Tab = 'code' | 'qr';

type RoomPreview = {
  name: string;
  member_count: number;
  session_date: string;
} | null;

function CornerBrackets() {
  const size = 28;
  const thickness = 3;
  const c = colors.primary;

  return (
    <>
      {/* Top-left */}
      <View
        className="absolute left-4 top-4"
        style={{ width: size, height: size, borderLeftWidth: thickness, borderTopWidth: thickness, borderColor: c, borderTopLeftRadius: 4 }}
      />
      {/* Top-right */}
      <View
        className="absolute right-4 top-4"
        style={{ width: size, height: size, borderRightWidth: thickness, borderTopWidth: thickness, borderColor: c, borderTopRightRadius: 4 }}
      />
      {/* Bottom-left */}
      <View
        className="absolute bottom-4 left-4"
        style={{ width: size, height: size, borderLeftWidth: thickness, borderBottomWidth: thickness, borderColor: c, borderBottomLeftRadius: 4 }}
      />
      {/* Bottom-right */}
      <View
        className="absolute bottom-4 right-4"
        style={{ width: size, height: size, borderRightWidth: thickness, borderBottomWidth: thickness, borderColor: c, borderBottomRightRadius: 4 }}
      />
    </>
  );
}

function RoomPreviewCard({ preview }: { preview: RoomPreview }) {
  if (!preview) return null;

  return (
    <Card className="mb-4">
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Text className="text-lg font-bold text-primary">
            {preview.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-white">{preview.name}</Text>
          <View className="mt-0.5 flex-row items-center gap-1">
            <Users size={12} color={colors.textMuted} />
            <Text className="text-xs text-text-muted">
              {preview.member_count} {preview.member_count === 1 ? 'member' : 'members'}
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

export default function JoinRoomScreen() {
  const router = useRouter();
  const joinRoom = useJoinRoom();
  const [activeTab, setActiveTab] = useState<Tab>('code');
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const [permission, requestPermission] = useCameraPermissions();
  const [roomPreview, setRoomPreview] = useState<RoomPreview>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fullCode = code.join('');
  const isComplete = fullCode.length === CODE_LENGTH && code.every((c) => c !== '');

  // Fetch room preview when code is complete
  useEffect(() => {
    if (!isComplete) {
      setRoomPreview(null);
      return;
    }

    let cancelled = false;
    async function fetchPreview() {
      setPreviewLoading(true);
      try {
        const { data: room } = await supabase
          .from('rooms')
          .select('name, session_date, room_members(count)')
          .eq('invite_code', fullCode.toUpperCase())
          .eq('is_active', true)
          .single();

        if (cancelled || !room) {
          if (!cancelled) setRoomPreview(null);
          return;
        }

        const count =
          Array.isArray(room.room_members) && room.room_members.length > 0
            ? (room.room_members[0] as { count: number }).count
            : 0;

        setRoomPreview({
          name: room.name,
          member_count: count,
          session_date: room.session_date,
        });
      } catch {
        if (!cancelled) setRoomPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }

    fetchPreview();
    return () => { cancelled = true; };
  }, [fullCode, isComplete]);

  function handleCharChange(text: string, index: number) {
    const char = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!char && text !== '') return;

    const newCode = [...code];
    newCode[index] = char;
    setCode(newCode);
    setError(null);

    if (char && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyPress(key: string, index: number) {
    if (key === 'Backspace' && !code[index] && index > 0) {
      const newCode = [...code];
      newCode[index - 1] = '';
      setCode(newCode);
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleJoin(inviteCode?: string) {
    const codeToUse = inviteCode ?? fullCode;
    if (codeToUse.length !== CODE_LENGTH) return;
    setError(null);

    try {
      const room = await joinRoom.mutateAsync({ p_invite_code: codeToUse });
      router.replace(`./${room.id}`);
    } catch (err) {
      setError(parseJoinError(err));
      setScanned(false);
    }
  }

  function handleBarcodeScan({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);

    const cleaned = data.trim().toUpperCase();
    const match = cleaned.match(/[A-Z0-9]{6}/);
    const scannedCode = match ? match[0] : cleaned.slice(0, 6);

    if (scannedCode.length === CODE_LENGTH) {
      const chars = scannedCode.split('');
      setCode(chars);
      setActiveTab('code');
      handleJoin(scannedCode);
    } else {
      setError('Invalid QR code');
      setScanned(false);
    }
  }

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    setError(null);
    setScanned(false);
    if (tab === 'qr' && !permission?.granted) {
      requestPermission();
    }
  }

  return (
    <Pressable className="flex-1 bg-background" onPress={Keyboard.dismiss}>
      <ScreenHeader title="Join Room" showBack />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pt-4 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        {/* Tab toggle */}
        <View className="mb-6 flex-row rounded-xl bg-surface p-1">
          <TouchableOpacity
            className={`flex-1 items-center rounded-lg py-2.5 ${activeTab === 'code' ? 'bg-primary' : ''}`}
            onPress={() => handleTabChange('code')}
            activeOpacity={0.7}
          >
            <Text
              className={`text-sm font-semibold ${activeTab === 'code' ? 'text-white' : 'text-text-secondary'}`}
            >
              Invite Code
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 items-center rounded-lg py-2.5 ${activeTab === 'qr' ? 'bg-primary' : ''}`}
            onPress={() => handleTabChange('qr')}
            activeOpacity={0.7}
          >
            <Text
              className={`text-sm font-semibold ${activeTab === 'qr' ? 'text-white' : 'text-text-secondary'}`}
            >
              Scan QR
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'code' ? (
          <>
            <Text className="mb-4 text-center text-sm text-text-secondary">
              Enter the 6-character invite code shared by the room admin
            </Text>

            {/* Code input boxes */}
            <View className="mb-5 flex-row justify-center gap-2">
              {code.map((char, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => {
                    inputRefs.current[index] = ref;
                  }}
                  value={char}
                  onChangeText={(text) => handleCharChange(text, index)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                  maxLength={1}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  className={`h-14 w-12 rounded-xl border text-center text-xl font-bold text-white ${
                    char ? 'border-primary bg-primary/10' : 'border-border bg-surface'
                  }`}
                  selectionColor={colors.primary}
                />
              ))}
            </View>

            {/* Room preview */}
            {previewLoading && isComplete && (
              <View className="mb-4 items-center py-3">
                <ActivityIndicator color={colors.primary} size="small" />
              </View>
            )}
            {!previewLoading && roomPreview && <RoomPreviewCard preview={roomPreview} />}

            {error ? (
              <View className="mb-4 items-center rounded-xl bg-error/10 px-3 py-3">
                <Text className="text-sm text-error">{error}</Text>
              </View>
            ) : null}

            <Button
              onPress={() => handleJoin()}
              disabled={!isComplete}
              loading={joinRoom.isPending}
              className="mb-6"
            >
              Join Room
            </Button>

            {/* Create room link */}
            <View className="items-center">
              <Text className="text-sm text-text-muted">{"Don't have a code?"}</Text>
              <TouchableOpacity
                onPress={() => router.replace('/(tabs)/rooms/create')}
                activeOpacity={0.7}
              >
                <Text className="mt-1 text-sm font-semibold text-primary">Create a Room</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {!permission?.granted ? (
              <View className="items-center py-12">
                <Text className="mb-4 text-center text-base text-text-secondary">
                  Camera access is needed to scan QR codes
                </Text>
                <Button onPress={requestPermission}>Grant Camera Access</Button>
              </View>
            ) : (
              <>
                <Text className="mb-4 text-center text-sm text-text-secondary">
                  Point your camera at a room's QR code to join instantly
                </Text>

                {/* Camera with corner brackets */}
                <View className="mb-4 items-center">
                  <View className="overflow-hidden rounded-2xl" style={{ width: 300, height: 300 }}>
                    <CameraView
                      style={{ width: 300, height: 300 }}
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      onBarcodeScanned={scanned ? undefined : handleBarcodeScan}
                    />
                    <CornerBrackets />
                  </View>
                </View>

                {error ? (
                  <View className="mb-4 items-center rounded-xl bg-error/10 px-3 py-3">
                    <Text className="text-sm text-error">{error}</Text>
                  </View>
                ) : null}

                <Text className="mb-5 text-center text-sm text-text-muted">
                  {joinRoom.isPending ? 'Joining room...' : 'Scanning...'}
                </Text>

                {/* Divider */}
                <View className="mb-5 flex-row items-center gap-3">
                  <View className="flex-1 h-px bg-border" />
                  <Text className="text-xs text-text-muted">or enter code manually</Text>
                  <View className="flex-1 h-px bg-border" />
                </View>

                <Button variant="outline" onPress={() => handleTabChange('code')}>
                  Enter invite code instead
                </Button>
              </>
            )}
          </>
        )}
      </ScrollView>
    </Pressable>
  );
}
