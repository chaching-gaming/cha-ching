import { View } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <View
      accessibilityRole="none"
      className={`rounded-2xl border border-border bg-surface p-5 ${className}`}
    >
      {children}
    </View>
  );
}
