import type { Environment } from '@cha-ching/types';

declare const process: {
  env: {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    EXPO_PUBLIC_ENV?: string;
    EXPO_PUBLIC_PROJECT_ID?: string;
    EXPO_PUBLIC_SENTRY_DSN?: string;
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?: string;
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?: string;
  };
};

export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  environment: (process.env.EXPO_PUBLIC_ENV ?? 'development') as Environment,
  expoProjectId: process.env.EXPO_PUBLIC_PROJECT_ID ?? '',
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
} as const;
