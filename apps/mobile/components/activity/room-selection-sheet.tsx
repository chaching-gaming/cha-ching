import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretRight } from 'phosphor-react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';

import { useTheme } from '@/providers/theme';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useRooms, type RoomWithMembership } from '@/hooks/use-rooms';
import { formatSessionDateShort } from '@/lib/date-format';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelectRoom: (roomId: string) => void;
};

function RoomRow({
  item,
  onPress,
}: {
  item: RoomWithMembership;
  onPress: (roomId: string) => void;
}) {
  const { colors } = useTheme();
  const overflow = item.room.member_count - item.memberPreviews.length;

  return (
    <TouchableOpacity
      onPress={() => onPress(item.room.id)}
      activeOpacity={0.75}
      className="flex-row items-center gap-3 border-b border-border px-1 py-4"
    >
      <View className="flex-1">
        <Text className="text-base font-semibold text-text-primary" numberOfLines={1}>
          {item.room.name}
        </Text>
        <View className="mt-1 flex-row items-center gap-2">
          <Text className="text-sm text-text-secondary">
            {formatSessionDateShort(item.room.session_date)}
          </Text>
          <Text className="text-sm text-text-muted">·</Text>
          <Text className="text-sm text-text-secondary">
            {item.room.member_count} {item.room.member_count === 1 ? 'member' : 'members'}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center">
        {item.memberPreviews.slice(0, 3).map((member, index) => (
          <View
            key={index}
            className={`rounded-full border-2 border-background ${index > 0 ? '-ml-2' : ''}`}
            style={{ zIndex: 10 - index }}
          >
            <Avatar uri={member.avatar_url} fallback={member.display_name ?? '?'} size="sm" />
          </View>
        ))}
        {overflow > 0 ? (
          <View className="-ml-2 h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-surface-light">
            <Text className="text-xs font-semibold text-text-secondary">+{overflow}</Text>
          </View>
        ) : null}
      </View>

      <CaretRight size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

export function RoomSelectionSheet({ visible, onClose, onSelectRoom }: Props) {
  const { colors } = useTheme();
  const safeInsets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const router = useRouter();
  const sheetRef = useRef<BottomSheetModal>(null);
  const { data: rooms, isLoading } = useRooms('active');

  const maxDynamicHeight = screenHeight - safeInsets.top - 8;

  useEffect(() => {
    if (visible) sheetRef.current?.present();
    else sheetRef.current?.dismiss();
  }, [visible]);

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleCreateRoom = useCallback(() => {
    onClose();
    router.push('/(tabs)/rooms/create');
  }, [onClose, router]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        opacity={0.65}
      />
    ),
    [],
  );

  const listHeader = useMemo(
    () => <Text className="mb-2 text-xl font-bold text-text-primary">Choose a room to create bet</Text>,
    [],
  );

  const bottomInset = Math.max(safeInsets.bottom, 20);

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      maxDynamicContentSize={maxDynamicHeight}
      enablePanDownToClose
      onDismiss={handleDismiss}
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
      backdropComponent={renderBackdrop}
    >
      {isLoading ? (
        <BottomSheetView
          style={{ paddingHorizontal: 20, paddingBottom: bottomInset, paddingTop: 4 }}
        >
          {listHeader}
          <View className="items-center justify-center py-12">
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        </BottomSheetView>
      ) : !rooms?.length ? (
        <BottomSheetView
          style={{ paddingHorizontal: 20, paddingBottom: bottomInset, paddingTop: 4 }}
        >
          {listHeader}
          <View className="items-center px-2 py-8">
            <Text className="text-lg font-semibold text-text-primary">No active rooms</Text>
            <Text className="mb-5 mt-2 text-center text-base leading-6 text-text-secondary">
              You need an active room before placing a bet.
            </Text>
            <Button onPress={handleCreateRoom}>Create a Room</Button>
          </View>
        </BottomSheetView>
      ) : (
        <BottomSheetFlatList
          data={rooms}
          keyExtractor={(item) => item.room.id}
          renderItem={({ item }) => <RoomRow item={item} onPress={onSelectRoom} />}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: bottomInset,
            paddingTop: 4,
          }}
        />
      )}
    </BottomSheetModal>
  );
}
