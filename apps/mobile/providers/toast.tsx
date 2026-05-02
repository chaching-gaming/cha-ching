import { createContext, useCallback, useContext, useState } from 'react';
import { View } from 'react-native';

import { Toast, type ToastProps } from '@/components/ui/toast';

type ToastType = 'error' | 'success' | 'info';

interface ToastConfig {
  type: ToastType;
  message: string;
  /** Optional action button (e.g., retry) */
  action?: {
    label: string;
    onPress: () => void;
  };
  /** Auto-dismiss duration in ms (default: 4000, set to 0 to disable) */
  duration?: number;
}

interface ToastState extends ToastConfig {
  id: string;
}

interface ToastContextType {
  /** Show a toast notification */
  show: (config: ToastConfig) => string;
  /** Dismiss a specific toast by ID */
  dismiss: (id: string) => void;
  /** Dismiss all toasts */
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let toastIdCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const show = useCallback((config: ToastConfig) => {
    const id = `toast-${++toastIdCounter}`;
    const newToast: ToastState = { id, ...config };

    setToasts((prev) => [...prev, newToast]);

    // Auto-dismiss after duration (default 4000ms)
    const duration = config.duration ?? 4000;
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ show, dismiss, dismissAll }}>
      {children}
      {/* Toast container at top of screen */}
      <View className="absolute left-0 right-0 top-0 z-50 px-4 pt-14">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            type={toast.type}
            message={toast.message}
            action={toast.action}
            onDismiss={() => dismiss(toast.id)}
          />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
