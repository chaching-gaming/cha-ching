import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { AuthProvider } from './auth';
import { FeedbackProvider } from './feedback';
import { PreferencesProvider } from './preferences';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PreferencesProvider>
          <FeedbackProvider>{children}</FeedbackProvider>
        </PreferencesProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
