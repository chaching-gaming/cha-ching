import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { AuthProvider } from './auth';
import { FeedbackProvider } from './feedback';
import { NotificationProvider } from './notifications';
import { PreferencesProvider } from './preferences';
import { TimeProvider } from './time';
import { ToastProvider } from './toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TimeProvider>
        <AuthProvider>
          <PreferencesProvider>
            <ToastProvider>
              <NotificationProvider>
                <FeedbackProvider>{children}</FeedbackProvider>
              </NotificationProvider>
            </ToastProvider>
          </PreferencesProvider>
        </AuthProvider>
      </TimeProvider>
    </QueryClientProvider>
  );
}
