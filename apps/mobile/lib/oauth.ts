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
    console.log('[GoogleAuth] Web Client ID:', env.googleWebClientId);

    await GoogleSignin.hasPlayServices();
    console.log('[GoogleAuth] Play Services available');

    const response = await GoogleSignin.signIn();
    console.log('[GoogleAuth] Sign in response:', JSON.stringify(response, null, 2));

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

    console.log('[GoogleAuth] Success:', data.user?.email);
    return data;
  } catch (err) {
    console.error('[GoogleAuth] Error:', err);
    console.error('[GoogleAuth] Error details:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
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
