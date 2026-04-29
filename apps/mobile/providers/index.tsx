import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { AuthProvider } from './auth';
import { FeedbackProvider } from './feedback';
import { NotificationProvider } from './notifications';
import { PreferencesProvider } from './preferences';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PreferencesProvider>
          <NotificationProvider>
            <FeedbackProvider>{children}</FeedbackProvider>
          </NotificationProvider>
        </PreferencesProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
