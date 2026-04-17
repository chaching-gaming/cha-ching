import type { ReactNode } from 'react';
import type { ScrollViewProps } from 'react-native';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';

type Props = Omit<ScrollViewProps, 'keyboardShouldPersistTaps' | 'keyboardDismissMode'> & {
  children: ReactNode;
  /** Wrap the scroll area in a Pressable that dismisses the keyboard on tap. Default: true. */
  dismissOnTap?: boolean;
  /** iOS only — distance between the top of the screen and the top of this wrapper (e.g., header height). */
  keyboardVerticalOffset?: number;
};

/**
 * Scroll view with keyboard-safe defaults:
 * - iOS: `KeyboardAvoidingView behavior="padding"` so the focused input is never covered.
 * - Android: relies on system `adjustResize` (Expo default).
 * - Tap outside to dismiss (opt-out via `dismissOnTap={false}`).
 * - Drag-on-keyboard dismiss: interactive (iOS) / on-drag (Android).
 */
export function KeyboardAwareScrollView({
  children,
  className = 'flex-1',
  contentContainerClassName,
  dismissOnTap = true,
  keyboardVerticalOffset,
  ...scrollViewProps
}: Props) {
  const scroll = (
    <ScrollView
      className={className}
      contentContainerClassName={contentContainerClassName}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      showsVerticalScrollIndicator={false}
      {...scrollViewProps}
    >
      {children}
    </ScrollView>
  );

  const body = dismissOnTap ? (
    <Pressable className="flex-1" onPress={Keyboard.dismiss}>
      {scroll}
    </Pressable>
  ) : (
    scroll
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {body}
    </KeyboardAvoidingView>
  );
}
