import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Users } from 'phosphor-react-native';

import { useTheme } from '@/providers/theme';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { KeyboardAwareScrollView } from '@/components/form/keyboard-aware-scroll-view';
import { ScreenHeader } from '@/components/ui/screen-header';
import { supabase } from '@/lib/supabase';
import { useJoinRoom, getRpcErrorMessage } from '@/hooks/use-rooms';
import { WarningCircle } from 'phosphor-react-native';

const CODE_LENGTH = 6;

type Tab = 'code' | 'qr';

type RoomPreview = {
  name: string;
  member_count: number;
  session_date: string;
} | null;

function CornerBrackets() {
  const { colors } = useTheme();
  const size = 28;
  const thickness = 3;
  const c = colors.primary;

  return (
    <>
      {/* Top-left */}
      <View
        className="absolute left-4 top-4"
        style={{
          width: size,
          height: size,
          borderLeftWidth: thickness,
          borderTopWidth: thickness,
          borderColor: c,
          borderTopLeftRadius: 4,
        }}
      />
      {/* Top-right */}
      <View
        className="absolute right-4 top-4"
        style={{
          width: size,
          height: size,
          borderRightWidth: thickness,
          borderTopWidth: thickness,
          borderColor: c,
          borderTopRightRadius: 4,
        }}
      />
      {/* Bottom-left */}
      <View
        className="absolute bottom-4 left-4"
        style={{
          width: size,
          height: size,
          borderLeftWidth: thickness,
          borderBottomWidth: thickness,
          borderColor: c,
          borderBottomLeftRadius: 4,
        }}
      />
      {/* Bottom-right */}
      <View
        className="absolute bottom-4 right-4"
        style={{
          width: size,
          height: size,
          borderRightWidth: thickness,
          borderBottomWidth: thickness,
          borderColor: c,
          borderBottomRightRadius: 4,
        }}
      />
    </>
  );
}

function RoomPreviewCard({ preview }: { preview: RoomPreview }) {
  const { colors } = useTheme();
  if (!preview) return null;

  return (
    <Card className="mb-4">
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Text className="text-lg font-bold text-primary">
            {preview.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-base font-semibold text-text-primary" numberOfLines={1}>
            {preview.name}
          </Text>
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

function InvalidCodeCard() {
  const { colors } = useTheme();
  return (
    <View className="mb-4 items-center rounded-2xl border border-border bg-surface px-4 py-5">
      <WarningCircle size={36} color={colors.warning} weight="fill" />
      <Text className="mt-2 text-base font-semibold text-text-primary">No room found</Text>
      <Text className="mt-1 text-center text-sm text-text-muted">
        This code doesn&apos;t match any active room.{'\n'}Double-check with whoever invited you.
      </Text>
    </View>
  );
}

export default function JoinRoomScreen() {
  const { colors } = useTheme();
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
  const [previewNotFound, setPreviewNotFound] = useState(false);

  const fullCode = code.join('');
  const isComplete = fullCode.length === CODE_LENGTH && code.every((c) => c !== '');

  // Fetch room preview when code is complete
  useEffect(() => {
    if (!isComplete) {
      setRoomPreview(null);
      setPreviewNotFound(false);
      return;
    }

    let cancelled = false;
    async function fetchPreview() {
      setPreviewLoading(true);
      setPreviewNotFound(false);
      try {
        const { data: room } = await supabase
          .from('rooms')
          .select('name, session_date, room_members(count)')
          .eq('invite_code', fullCode.toUpperCase())
          .eq('is_active', true)
          .single();

        if (cancelled) return;

        if (!room) {
          setRoomPreview(null);
          setPreviewNotFound(true);
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
        setPreviewNotFound(false);
      } catch {
        if (!cancelled) {
          setRoomPreview(null);
          setPreviewNotFound(true);
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }

    fetchPreview();
    return () => {
      cancelled = true;
    };
  }, [fullCode, isComplete]);

  function handleCharChange(text: string, index: number) {
    const cleaned = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleaned && text !== '') return;

    // Pasted multi-character string — distribute across boxes
    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, CODE_LENGTH).split('');
      const newCode = Array(CODE_LENGTH).fill('');
      chars.forEach((c, i) => {
        newCode[i] = c;
      });
      setCode(newCode);
      setError(null);
      const focusIdx = Math.min(chars.length, CODE_LENGTH - 1);
      inputRefs.current[focusIdx]?.focus();
      return;
    }

    const newCode = [...code];
    newCode[index] = cleaned;
    setCode(newCode);
    setError(null);

    if (cleaned && index < CODE_LENGTH - 1) {
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
      setError(getRpcErrorMessage(err, 'Failed to join room'));
    }
  }

  function handleBarcodeScan({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);
    setError(null);

    const cleaned = data.trim().toUpperCase();
    const match = cleaned.match(/[A-Z0-9]{6}/);
    const scannedCode = match ? match[0] : cleaned.slice(0, 6);

    if (scannedCode.length === CODE_LENGTH) {
      const chars = scannedCode.split('');
      setCode(chars);
      handleJoin(scannedCode);
    } else {
      setError('Invalid QR code');
    }
  }

  function handleScanAgain() {
    setScanned(false);
    setError(null);
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
    <View className="flex-1 bg-background">
      <ScreenHeader title="Join Room" showBack />
      <KeyboardAwareScrollView contentContainerClassName="px-5 pt-4 pb-8">
        {/* Tab toggle */}
        <View className="mb-6 flex-row rounded-xl bg-surface p-1">
          <TouchableOpacity
            className={`flex-1 items-center rounded-lg py-2.5 ${activeTab === 'code' ? 'bg-primary' : ''}`}
            onPress={() => handleTabChange('code')}
            activeOpacity={0.7}
          >
            <Text
              className={`text-sm font-semibold ${activeTab === 'code' ? 'text-background' : 'text-text-secondary'}`}
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
              className={`text-sm font-semibold ${activeTab === 'qr' ? 'text-background' : 'text-text-secondary'}`}
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
                  autoCapitalize="characters"
                  autoCorrect={false}
                  className={`h-14 w-12 rounded-xl border text-center text-xl font-bold text-text-primary ${
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
            {!previewLoading && previewNotFound && isComplete && <InvalidCodeCard />}

            {error ? (
              <View className="mb-4 items-center rounded-xl bg-error/10 px-4 py-3">
                <Text className="text-center text-base text-error">{error}</Text>
              </View>
            ) : null}

            <Button
              onPress={() => handleJoin()}
              disabled={!isComplete || previewNotFound}
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
                  Point your camera at a room&apos;s QR code to join instantly
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
                  <>
                    <InvalidCodeCard />
                    <Button onPress={handleScanAgain} className="mb-4">
                      Scan Again
                    </Button>
                  </>
                ) : (
                  <Text className="mb-5 text-center text-sm text-text-muted">
                    {joinRoom.isPending ? 'Joining room...' : 'Scanning...'}
                  </Text>
                )}

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
      </KeyboardAwareScrollView>
    </View>
  );
}
