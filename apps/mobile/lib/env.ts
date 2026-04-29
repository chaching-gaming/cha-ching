import type { Environment } from '@cha-ching/types';

declare const process: {
  env: {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    EXPO_PUBLIC_ENV?: string;
    EXPO_PUBLIC_PROJECT_ID?: string;
  };
};

export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  environment: (process.env.EXPO_PUBLIC_ENV ?? 'development') as Environment,
  expoProjectId: process.env.EXPO_PUBLIC_PROJECT_ID ?? '',
} as const;
