import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@cha-ching/types';
import { env } from './env';

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

interface DeepLinkAuthResult {
  success: boolean;
  isRecovery: boolean;
}

// Handle deep link tokens for password recovery
export async function handleDeepLinkAuth(url: string): Promise<DeepLinkAuthResult> {
  // PKCE flow: handle 'code' parameter in query string
  const queryIndex = url.indexOf('?');
  if (queryIndex !== -1) {
    const queryString = url.substring(queryIndex + 1).split('#')[0]; // Get query before any hash
    const queryParams = new URLSearchParams(queryString);
    const code = queryParams.get('code');

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      // PKCE flow for password recovery - check if we're on reset-password path
      const isRecoveryPath = url.includes('reset-password');
      return { success: !error, isRecovery: isRecoveryPath };
    }
  }

  // Implicit flow fallback: extract tokens from URL fragment (after #)
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return { success: false, isRecovery: false };

  const fragment = url.substring(hashIndex + 1);
  const params = new URLSearchParams(fragment);

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type = params.get('type');

  if (accessToken && refreshToken && type === 'recovery') {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return { success: !error, isRecovery: true };
  }

  return { success: false, isRecovery: false };
}
