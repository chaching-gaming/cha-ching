import { Platform } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';
import { env } from './env';

// Configure Google Sign-In
GoogleSignin.configure({
  webClientId: env.googleWebClientId,
  iosClientId: Platform.OS === 'ios' ? env.googleIosClientId : undefined,
});

export async function signInWithGoogle() {
  try {
    console.log('[GoogleAuth] Starting sign in...');

    await GoogleSignin.hasPlayServices();
    console.log('[GoogleAuth] Play Services available');

    // Note: On iOS, we don't use nonces because Google's iOS SDK doesn't expose the raw nonce.
    // Enable "Skip nonce check" in Supabase Dashboard > Auth > Providers > Google for iOS Client ID.
    const response = await GoogleSignin.signIn();
    console.log('[GoogleAuth] Sign in response received');

    if (!response.data?.idToken) {
      console.error('[GoogleAuth] No ID token in response');
      throw new Error('No ID token returned from Google');
    }

    console.log('[GoogleAuth] Got ID token, calling Supabase...');
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: response.data.idToken,
    });

    if (error) {
      console.error('[GoogleAuth] Supabase error:', error);
      throw error;
    }

    // Update profile with Google user info if display_name is still default
    const googleUser = response.data.user;
    if (data.user && googleUser?.name) {
      await supabase
        .from('profiles')
        .update({
          display_name: googleUser.name,
          avatar_url: googleUser.photo || undefined,
        })
        .eq('id', data.user.id)
        .or('display_name.is.null,display_name.eq.New User');
    }

    console.log('[GoogleAuth] Success:', data.user?.email);
    return data;
  } catch (err) {
    console.error('[GoogleAuth] Error:', err);
    throw err;
  }
}

export async function signInWithApple() {
  if (Platform.OS !== 'ios') {
    throw new Error('Apple Sign-In is only available on iOS');
  }

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('No identity token returned from Apple');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });

  if (error) throw error;

  // Apple only sends name on FIRST sign-in, so capture it immediately
  const fullName = credential.fullName;
  if (data.user && fullName) {
    const displayName = [fullName.givenName, fullName.familyName].filter(Boolean).join(' ');
    if (displayName) {
      await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', data.user.id)
        .or('display_name.is.null,display_name.eq.New User');
    }
  }

  return data;
}

export async function signOut() {
  // Sign out from Google if signed in
  try {
    const isSignedIn = await GoogleSignin.hasPreviousSignIn();
    if (isSignedIn) {
      await GoogleSignin.signOut();
    }
  } catch {
    // Ignore Google sign out errors
  }

  // Sign out from Supabase
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
