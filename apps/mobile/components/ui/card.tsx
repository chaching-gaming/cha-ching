import { View } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <View className={`rounded-2xl bg-surface border border-border p-4 ${className}`}>
      {children}
    </View>
  );
}
