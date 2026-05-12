import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/query-client';
import { Sentry } from '@/lib/sentry';

interface AuthContextType {
  session: Session | null;
  isLoading: boolean;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  isLoading: true,
  isPasswordRecovery: false,
  clearPasswordRecovery: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const clearPasswordRecovery = () => setIsPasswordRecovery(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);

      // Set initial Sentry user context
      if (session?.user) {
        Sentry.setUser({
          id: session.user.id,
          email: session.user.email,
        });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Drop cached data tied to the previous auth context so queries from
      // another user (or anonymous) can't bleed into the next session.
      // INITIAL_SESSION fires on app start with an already-empty cache, so skip it.
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
        queryClient.clear();
      }

      // Update Sentry user context for error tracking
      if (session?.user) {
        Sentry.setUser({
          id: session.user.id,
          email: session.user.email,
        });
      } else {
        Sentry.setUser(null);
      }

      // Handle password recovery flow
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }

      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, isLoading, isPasswordRecovery, clearPasswordRecovery }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
