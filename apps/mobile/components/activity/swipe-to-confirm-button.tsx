import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ArrowRight, Check, Coins } from 'phosphor-react-native';

import { useTheme, type ThemeColors } from '@/providers/theme';
import type { BetWithProfiles } from '@/hooks/use-activity-feed';
import { useJoinBet } from '@/hooks/use-join-bet';
import { getRpcErrorMessage } from '@/hooks/use-rooms';

type Props = {
  bet: BetWithProfiles;
  selectedPick: string | null;
  displayLabel: string | null;
  onSuccess?: () => void;
  disabled?: boolean;
};

const BUTTON_HEIGHT = 56;
const THUMB_SIZE = 48;
const TRACK_PADDING = 4;
const START_THRESHOLD = 20; // pixels to move before auto-completing

export function SwipeToConfirmButton({
  bet,
  selectedPick,
  displayLabel,
  onSuccess,
  disabled = false,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const joinBet = useJoinBet();
  const [trackWidth, setTrackWidth] = useState(300);
  const [confirming, setConfirming] = useState(false);

  const translateX = useRef(new Animated.Value(0)).current;
  const scrollDistance = Math.max(0, trackWidth - THUMB_SIZE - TRACK_PADDING * 2);
  const isEnabled = !!selectedPick && !disabled && !joinBet.isPending && !confirming;

  // Store current values in refs so PanResponder always has access to latest values
  const scrollDistanceRef = useRef(scrollDistance);
  const isEnabledRef = useRef(isEnabled);
  const hasTriggeredRef = useRef(false);
  scrollDistanceRef.current = scrollDistance;
  isEnabledRef.current = isEnabled;

  const animateToStart = useCallback(() => {
    Animated.timing(translateX, {
      toValue: 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [translateX]);

  const showConfirmation = useCallback(() => {
    if (!selectedPick || !bet.room_id) return;

    setConfirming(true);
    Alert.alert(
      'Lock in bet?',
      `You'll back "${displayLabel || selectedPick}" for ${bet.stake.toLocaleString('en-US')} chips.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            setConfirming(false);
            animateToStart();
          },
        },
        {
          text: 'Lock In',
          style: 'default',
          onPress: async () => {
            try {
              await joinBet.mutateAsync({
                p_bet_id: bet.id,
                p_pick: selectedPick,
                roomId: bet.room_id!,
              });
              onSuccess?.();
            } catch (err) {
              Alert.alert('Could not lock in bet', getRpcErrorMessage(err, 'Please try again.'));
            } finally {
              setConfirming(false);
              animateToStart();
            }
          },
        },
      ],
    );
  }, [selectedPick, displayLabel, bet, joinBet, onSuccess, animateToStart]);

  // Store showConfirmation in a ref for PanResponder
  const showConfirmationRef = useRef(showConfirmation);
  showConfirmationRef.current = showConfirmation;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => false,
      onPanResponderGrant: () => {
        hasTriggeredRef.current = false;
      },
      onPanResponderMove: (_, gestureState) => {
        if (!isEnabledRef.current || hasTriggeredRef.current) return;

        // Once user swipes past threshold, auto-complete
        if (gestureState.dx >= START_THRESHOLD) {
          hasTriggeredRef.current = true;
          // Animate to end position then show confirmation
          Animated.timing(translateX, {
            toValue: scrollDistanceRef.current,
            duration: 150,
            useNativeDriver: false,
          }).start(() => {
            showConfirmationRef.current();
          });
          return;
        }

        // Track the swipe until threshold
        const clampedX = Math.max(0, Math.min(gestureState.dx, scrollDistanceRef.current));
        translateX.setValue(clampedX);
      },
      onPanResponderRelease: () => {
        // If not triggered, snap back to start
        if (!hasTriggeredRef.current) {
          animateToStart();
        }
      },
    })
  ).current;

  const handleLayout = useCallback((e: { nativeEvent: { layout: { width: number } } }) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  if (!selectedPick) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Select a side above to join</Text>
      </View>
    );
  }

  const isLoading = joinBet.isPending || confirming;

  // Interpolate underlay width based on thumb position
  const underlayWidth = translateX.interpolate({
    inputRange: [0, scrollDistance || 1],
    outputRange: [THUMB_SIZE + TRACK_PADDING * 2, trackWidth],
    extrapolate: 'clamp',
  });

  return (
    <View onLayout={handleLayout} style={styles.container}>
      {/* Label - visible when not swiping */}
      <View style={styles.labelContainer}>
        {isLoading ? (
          <Text style={styles.labelText}>Locking in...</Text>
        ) : (
          <View style={styles.labelRow}>
            <Text style={styles.labelText}>
              Swipe to lock in · {bet.stake.toLocaleString('en-US')}
            </Text>
            <Coins size={16} color={colors.chipsIcon} weight="fill" />
          </View>
        )}
      </View>

      {/* Underlay - green fill that expands as user swipes */}
      <Animated.View
        style={[
          styles.underlay,
          {
            width: underlayWidth,
          },
        ]}
      />

      {/* Thumb - positioned absolutely */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.thumb,
          {
            transform: [{ translateX }],
            opacity: isLoading ? 0.5 : 1,
          },
        ]}
      >
        {isLoading ? (
          <Check size={24} color="#FFFFFF" weight="bold" />
        ) : (
          <ArrowRight size={24} color="#FFFFFF" weight="bold" />
        )}
      </Animated.View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      marginTop: 12,
      height: BUTTON_HEIGHT,
      backgroundColor: colors.surfaceLight,
      borderRadius: 12,
      justifyContent: 'center',
    },
    emptyContainer: {
      marginTop: 12,
      height: BUTTON_HEIGHT,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textMuted,
    },
    labelContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: THUMB_SIZE + TRACK_PADDING * 2,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    labelText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.primary,
    },
    thumb: {
      position: 'absolute',
      left: TRACK_PADDING,
      top: TRACK_PADDING,
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
    },
    underlay: {
      position: 'absolute',
      left: 0,
      top: 0,
      height: BUTTON_HEIGHT,
      backgroundColor: colors.primary,
      borderRadius: 12,
      zIndex: 1,
    },
  });
}
