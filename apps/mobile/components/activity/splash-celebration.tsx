import { useEffect, useState } from 'react';
import { AccessibilityInfo, Dimensions, Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSequence,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';

// @ts-expect-error - PNG import
import ballImage from '@/assets/images/chaching-ball.png';

/**
 * Action types for the splash celebration
 */
export type SplashAction =
  | 'round_started'
  | 'wager_placed'
  | 'bet_accepted'
  | 'birdie'
  | 'you_won'
  | 'paid_out';

type SplashCelebrationProps = {
  visible: boolean;
  action: SplashAction;
  onDone: () => void;
};

/** Text content per action */
const ACTION_CONTENT: Record<SplashAction, { headline: string[]; subline: string }> = {
  round_started: { headline: ["YOU'RE IN", 'THE GAME!'], subline: "Round's live. Bets are on." },
  wager_placed: { headline: ['YOUR WAGER', 'IS SET!'], subline: "You're locked in. Game on." },
  bet_accepted: { headline: ['MATCH SET,', 'GOOD LUCK!'], subline: 'Your opponent is in.' },
  birdie: { headline: ['BIRDIE!'], subline: 'That one pays.' },
  you_won: { headline: ['YOU', 'WON!'], subline: 'Winnings are on the way.' },
  paid_out: { headline: ['PAID', 'OUT!'], subline: 'Winnings sent to your wallet.' },
};

// Reference frame: 390×844
const REF_WIDTH = 390;
const REF_HEIGHT = 844;

// Layout positions (from reference)
const BALL_SIZE = 300;
const BALL_TOP = 230;
const BALL_LEFT = 45; // (390 - 300) / 2
const SHADOW_WIDTH = 220;
const SHADOW_HEIGHT = 34;
const SHADOW_TOP = 526;
const SHADOW_LEFT = 85;
const COPY_TOP = 584;
const RING_SIZE = 300;

// Colors from the reference
const BRIGHT_GREEN = '#34BE47'; // Middle of gradient
const DARK_GREEN = '#052A17';

// Timeline: 2.8s total, action done by 2.0s
// Percentages from CSS converted to ms (percent × 28)
const T = {
  DARK_HOLD: 150, // 5.36%
  DARK_FADE_END: 350, // 12.5%
  WORD_FADE_END: 400, // 14.29%
  BALL_VISIBLE: 300, // 10.71%
  BALL_OVERSHOOT: 550, // 19.64%
  BALL_SQUASH: 700, // 25%
  BALL_BOUNCE: 825, // 29.46%
  BALL_SETTLED: 950, // 33.93%
  RING_START: 600, // 21.43%
  RING_END: 1200, // 42.86%
  HEAD_NUDGE_START: 600, // 21.43%
  HEAD_NUDGE_PEAK: 700, // 25%
  HEAD_NUDGE_END: 850, // 30.36%
  SUB_START: 850, // 30.36%
  SUB_END: 1100, // 39.29%
  HOLD_END: 2000, // Hand off at 2.0s
};

// Easing curves from CSS
const EASE_OUT_SMOOTH = Easing.bezier(0.3, 0, 0.2, 1);
const EASE_BOUNCE = Easing.bezier(0.3, 0, 0.3, 1);
const EASE_SOFT = Easing.bezier(0.2, 0.7, 0.3, 1);

export function SplashCelebration({ visible, action, onDone }: SplashCelebrationProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const scale = Math.min(screenWidth / REF_WIDTH, screenHeight / REF_HEIGHT);

  // Check reduced motion preference
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  // Animation values
  const dimOpacity = useSharedValue(1);
  const wordOpacity = useSharedValue(0);
  const ballOpacity = useSharedValue(0);
  const ballY = useSharedValue(30);
  const ballScale = useSharedValue(0.3);
  const ballScaleX = useSharedValue(1);
  const ballScaleY = useSharedValue(1);
  const shadowOpacity = useSharedValue(0);
  const shadowScale = useSharedValue(0.3);
  const ringOpacity = useSharedValue(0);
  const ringScale = useSharedValue(0.9);
  const headOpacity = useSharedValue(0);
  const headY = useSharedValue(10);
  const headScale = useSharedValue(1);
  const subOpacity = useSharedValue(0);
  const subY = useSharedValue(8);

  useEffect(() => {
    if (visible) {
      if (reduceMotion) {
        // Skip to final frame instantly
        dimOpacity.value = 0;
        wordOpacity.value = 1;
        ballOpacity.value = 1;
        ballY.value = 0;
        ballScale.value = 1;
        ballScaleX.value = 1;
        ballScaleY.value = 1;
        shadowOpacity.value = 0.5; // Visible shadow
        shadowScale.value = 1;
        ringOpacity.value = 0;
        ringScale.value = 1.6;
        headOpacity.value = 1;
        headY.value = 0;
        headScale.value = 1;
        subOpacity.value = 1;
        subY.value = 0;

        const timer = setTimeout(() => runOnJS(onDone)(), T.HOLD_END);
        return () => clearTimeout(timer);
      }

      // Reset all values
      dimOpacity.value = 1;
      wordOpacity.value = 0;
      ballOpacity.value = 0;
      ballY.value = 30;
      ballScale.value = 0.3;
      ballScaleX.value = 1;
      ballScaleY.value = 1;
      shadowOpacity.value = 0;
      shadowScale.value = 0.3;
      ringOpacity.value = 0;
      ringScale.value = 0.9;
      headOpacity.value = 0;
      headY.value = 10;
      headScale.value = 1;
      subOpacity.value = 0;
      subY.value = 8;

      // === Dark overlay fade out (0.15s → 0.35s) ===
      dimOpacity.value = withDelay(
        T.DARK_HOLD,
        withTiming(0, { duration: T.DARK_FADE_END - T.DARK_HOLD, easing: EASE_OUT_SMOOTH })
      );

      // === Wordmark fade in (0.15s → 0.4s) ===
      wordOpacity.value = withDelay(
        T.DARK_HOLD,
        withTiming(1, { duration: T.WORD_FADE_END - T.DARK_HOLD, easing: Easing.linear })
      );

      // === Ball animation ===
      // Opacity: 0 until 0.15s, then fade in by 0.3s
      ballOpacity.value = withDelay(
        T.DARK_HOLD,
        withTiming(1, { duration: T.BALL_VISIBLE - T.DARK_HOLD, easing: Easing.linear })
      );

      // Position & scale: complex sequence with more pronounced bounce
      ballY.value = withDelay(
        T.DARK_HOLD,
        withSequence(
          // Rise to overshoot (0.15s → 0.55s) - ball comes up
          withTiming(-20, { duration: T.BALL_OVERSHOOT - T.DARK_HOLD, easing: EASE_BOUNCE }),
          // Down to squash (0.55s → 0.7s) - lands with impact
          withTiming(12, { duration: T.BALL_SQUASH - T.BALL_OVERSHOOT, easing: EASE_BOUNCE }),
          // Up for bounce (0.7s → 0.825s)
          withTiming(-8, { duration: T.BALL_BOUNCE - T.BALL_SQUASH, easing: EASE_BOUNCE }),
          // Second smaller bounce down
          withTiming(4, { duration: 80, easing: EASE_BOUNCE }),
          // Final settle (0.825s → 0.95s)
          withTiming(0, { duration: T.BALL_SETTLED - T.BALL_BOUNCE - 80, easing: EASE_BOUNCE })
        )
      );

      ballScale.value = withDelay(
        T.DARK_HOLD,
        withSequence(
          // Grow to overshoot
          withTiming(1.08, { duration: T.BALL_OVERSHOOT - T.DARK_HOLD, easing: EASE_BOUNCE }),
          // Squash
          withTiming(1, { duration: T.BALL_SETTLED - T.BALL_OVERSHOOT, easing: EASE_BOUNCE })
        )
      );

      // Squash/stretch effect - more pronounced for visible bounce
      ballScaleX.value = withDelay(
        T.BALL_OVERSHOOT,
        withSequence(
          // Squash on landing (wider)
          withTiming(1.08, { duration: T.BALL_SQUASH - T.BALL_OVERSHOOT }),
          // Stretch on bounce up (narrower)
          withTiming(0.96, { duration: T.BALL_BOUNCE - T.BALL_SQUASH }),
          // Small squash on second landing
          withTiming(1.03, { duration: 80 }),
          // Settle
          withTiming(1, { duration: T.BALL_SETTLED - T.BALL_BOUNCE - 80 })
        )
      );

      ballScaleY.value = withDelay(
        T.BALL_OVERSHOOT,
        withSequence(
          // Squash on landing (shorter)
          withTiming(0.92, { duration: T.BALL_SQUASH - T.BALL_OVERSHOOT }),
          // Stretch on bounce up (taller)
          withTiming(1.04, { duration: T.BALL_BOUNCE - T.BALL_SQUASH }),
          // Small squash on second landing
          withTiming(0.97, { duration: 80 }),
          // Settle
          withTiming(1, { duration: T.BALL_SETTLED - T.BALL_BOUNCE - 80 })
        )
      );

      // === Shadow animation - synced with ball bounce ===
      // Shadow is lighter/smaller when ball is up, darker/larger when ball lands
      shadowOpacity.value = withDelay(
        T.DARK_HOLD,
        withSequence(
          // Ball rising - shadow fades in but stays light
          withTiming(0.3, { duration: T.BALL_OVERSHOOT - T.DARK_HOLD, easing: EASE_BOUNCE }),
          // Ball lands - shadow darkens
          withTiming(0.6, { duration: T.BALL_SQUASH - T.BALL_OVERSHOOT }),
          // Ball bounces up - shadow lightens
          withTiming(0.35, { duration: T.BALL_BOUNCE - T.BALL_SQUASH }),
          // Second landing - shadow darkens slightly
          withTiming(0.5, { duration: 80 }),
          // Settle to final
          withTiming(0.4, { duration: T.BALL_SETTLED - T.BALL_BOUNCE - 80 })
        )
      );

      shadowScale.value = withDelay(
        T.DARK_HOLD,
        withSequence(
          // Ball rising - shadow smaller (ball is far)
          withTiming(0.85, { duration: T.BALL_OVERSHOOT - T.DARK_HOLD, easing: EASE_BOUNCE }),
          // Ball lands - shadow expands
          withTiming(1.15, { duration: T.BALL_SQUASH - T.BALL_OVERSHOOT }),
          // Ball bounces up - shadow shrinks
          withTiming(0.9, { duration: T.BALL_BOUNCE - T.BALL_SQUASH }),
          // Second landing - shadow expands slightly
          withTiming(1.05, { duration: 80 }),
          // Settle
          withTiming(1, { duration: T.BALL_SETTLED - T.BALL_BOUNCE - 80 })
        )
      );

      // === Ring animation (0.55s → 1.2s) ===
      ringOpacity.value = withDelay(
        T.BALL_OVERSHOOT,
        withSequence(
          withTiming(0.5, { duration: T.RING_START - T.BALL_OVERSHOOT }),
          withTiming(0, { duration: T.RING_END - T.RING_START, easing: EASE_SOFT })
        )
      );

      ringScale.value = withDelay(
        T.BALL_OVERSHOOT,
        withSequence(
          withTiming(0.95, { duration: T.RING_START - T.BALL_OVERSHOOT }),
          withTiming(1.6, { duration: T.RING_END - T.RING_START, easing: EASE_SOFT })
        )
      );

      // === Headline animation ===
      headOpacity.value = withDelay(
        T.DARK_HOLD,
        withTiming(1, { duration: T.WORD_FADE_END - T.DARK_HOLD, easing: EASE_SOFT })
      );

      headY.value = withDelay(
        T.DARK_HOLD,
        withTiming(0, { duration: T.WORD_FADE_END - T.DARK_HOLD, easing: EASE_SOFT })
      );

      // Nudge effect (0.6s → 0.85s)
      headScale.value = withDelay(
        T.HEAD_NUDGE_START,
        withSequence(
          withTiming(1.04, { duration: T.HEAD_NUDGE_PEAK - T.HEAD_NUDGE_START, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: T.HEAD_NUDGE_END - T.HEAD_NUDGE_PEAK, easing: Easing.inOut(Easing.ease) })
        )
      );

      // === Subline animation (0.85s → 1.1s) ===
      subOpacity.value = withDelay(
        T.SUB_START,
        withTiming(1, { duration: T.SUB_END - T.SUB_START, easing: EASE_SOFT })
      );

      subY.value = withDelay(
        T.SUB_START,
        withTiming(0, { duration: T.SUB_END - T.SUB_START, easing: EASE_SOFT })
      );

      // Hand off at 2.0s
      const timer = setTimeout(() => runOnJS(onDone)(), T.HOLD_END);
      return () => clearTimeout(timer);
    }
  }, [visible, reduceMotion, onDone, dimOpacity, wordOpacity, ballOpacity, ballY, ballScale, ballScaleX, ballScaleY, shadowOpacity, shadowScale, ringOpacity, ringScale, headOpacity, headY, headScale, subOpacity, subY]);

  // Animated styles
  const dimStyle = useAnimatedStyle(() => ({ opacity: dimOpacity.value }));
  const wordStyle = useAnimatedStyle(() => ({ opacity: wordOpacity.value }));
  const ballStyle = useAnimatedStyle(() => ({
    opacity: ballOpacity.value,
    transform: [
      { translateY: ballY.value * scale },
      { scale: ballScale.value },
      { scaleX: ballScaleX.value },
      { scaleY: ballScaleY.value },
    ],
  }));
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: shadowOpacity.value,
    transform: [{ scaleX: shadowScale.value }, { scaleY: 1 }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));
  const headStyle = useAnimatedStyle(() => ({
    opacity: headOpacity.value,
    transform: [{ translateY: headY.value * scale }, { scale: headScale.value }],
  }));
  const subStyle = useAnimatedStyle(() => ({
    opacity: subOpacity.value,
    transform: [{ translateY: subY.value * scale }],
  }));

  if (!visible) return null;

  const content = ACTION_CONTENT[action];
  const s = scale; // shorthand

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={onDone}>
      {/* Bright green background */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: BRIGHT_GREEN }]} />

      {/* Background wordmark */}
      <Animated.View
        style={[
          styles.wordmark,
          wordStyle,
          {
            top: 222 * s,
            left: -40 * s,
            right: -40 * s,
          },
        ]}
      >
        <Animated.Text
          style={[
            styles.wordmarkText,
            { fontSize: 150 * s, lineHeight: 150 * 0.86 * s },
          ]}
        >
          {'CHA\nCHING'}
        </Animated.Text>
      </Animated.View>

      {/* Dark overlay */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: DARK_GREEN }, dimStyle]} />

      {/* Shadow - ellipse shape with soft edges */}
      <Animated.View
        style={[
          styles.shadow,
          shadowStyle,
          {
            left: SHADOW_LEFT * s + (screenWidth - REF_WIDTH * s) / 2,
            top: SHADOW_TOP * s + (screenHeight - REF_HEIGHT * s) / 2,
            width: SHADOW_WIDTH * s,
            height: SHADOW_HEIGHT * s,
            borderRadius: "60%",
          },
        ]}
      />

      {/* Ring */}
      <Animated.View
        style={[
          styles.ring,
          ringStyle,
          {
            left: BALL_LEFT * s + (screenWidth - REF_WIDTH * s) / 2,
            top: BALL_TOP * s + (screenHeight - REF_HEIGHT * s) / 2,
            width: RING_SIZE * s,
            height: RING_SIZE * s,
            borderRadius: (RING_SIZE * s) / 2,
            borderWidth: 4 * s,
          },
        ]}
      />

      {/* Ball */}
      <Animated.View
        style={[
          styles.ball,
          ballStyle,
          {
            left: BALL_LEFT * s + (screenWidth - REF_WIDTH * s) / 2,
            top: BALL_TOP * s + (screenHeight - REF_HEIGHT * s) / 2,
            width: BALL_SIZE * s,
            height: BALL_SIZE * s,
          },
        ]}
      >
        <Image
          source={ballImage}
          style={{ width: BALL_SIZE * s, height: BALL_SIZE * s }}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Copy */}
      <View
        style={[
          styles.copy,
          {
            top: COPY_TOP * s + (screenHeight - REF_HEIGHT * s) / 2,
            left: 20 * s,
            right: 20 * s,
          },
        ]}
      >
        {/* Headline with text stroke effect */}
        <Animated.View style={[styles.headlineContainer, headStyle]}>
          {content.headline.map((line, i) => {
            const fontSize = 60 * s;
            const lineHeight = 60 * 0.94 * s;
            const strokeWidth = 5 * s;
            const strokeColor = '#0A4F24';
            // Stroke offsets for 8 directions to create outline
            const strokeOffsets = [
              { x: -strokeWidth, y: 0 },
              { x: strokeWidth, y: 0 },
              { x: 0, y: -strokeWidth },
              { x: 0, y: strokeWidth },
              { x: -strokeWidth * 0.7, y: -strokeWidth * 0.7 },
              { x: strokeWidth * 0.7, y: -strokeWidth * 0.7 },
              { x: -strokeWidth * 0.7, y: strokeWidth * 0.7 },
              { x: strokeWidth * 0.7, y: strokeWidth * 0.7 },
            ];
            return (
              <View key={i} style={{ position: 'relative' }}>
                {/* Stroke layers */}
                {strokeOffsets.map((offset, idx) => (
                  <Animated.Text
                    key={`stroke-${idx}`}
                    style={[
                      styles.headline,
                      styles.headlineStroke,
                      {
                        fontSize,
                        lineHeight,
                        color: strokeColor,
                        position: 'absolute',
                        left: offset.x,
                        top: offset.y,
                      },
                    ]}
                  >
                    {line}
                  </Animated.Text>
                ))}
                {/* Main text on top */}
                <Animated.Text
                  style={[
                    styles.headline,
                    {
                      fontSize,
                      lineHeight,
                      textShadowOffset: { width: 0, height: 4 * s },
                      textShadowRadius: 0,
                    },
                  ]}
                >
                  {line}
                </Animated.Text>
              </View>
            );
          })}
        </Animated.View>

        {/* Subline */}
        <Animated.View
          style={[
            styles.sublineContainer,
            subStyle,
            {
              marginTop: 16 * s,
              paddingHorizontal: 20 * s,
              paddingVertical: 10 * s,
              borderRadius: 999,
            },
          ]}
        >
          <Animated.Text style={[styles.subline, { fontSize: 18 * s }]}>
            {content.subline}
          </Animated.Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  wordmarkText: {
    fontFamily: 'LilitaOne_400Regular',
    color: 'rgba(6, 70, 32, 0.14)',
    textAlign: 'center',
    letterSpacing: 2,
  },
  shadow: {
    position: 'absolute',
    // Soft ellipse shadow - opacity controlled via animation
    backgroundColor: 'rgba(3, 45, 20, 0.5)',
  },
  ring: {
    position: 'absolute',
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  ball: {
    position: 'absolute',
    shadowColor: 'rgb(3, 40, 18)',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  copy: {
    position: 'absolute',
    alignItems: 'center',
  },
  headlineContainer: {
    alignItems: 'center',
  },
  headline: {
    fontFamily: 'LilitaOne_400Regular',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 1,
    // Text shadow for depth
    textShadowColor: '#073D1B',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 0,
  },
  headlineStroke: {
    // Stroke text has no shadow, just solid color for outline effect
    textShadowColor: 'transparent',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0,
  },
  sublineContainer: {
    backgroundColor: 'rgba(4, 46, 24, 0.72)',
  },
  subline: {
    fontFamily: 'Fredoka_600SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 22,
  },
});
