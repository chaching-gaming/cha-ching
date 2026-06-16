import { Text } from 'react-native';

type Props = {
  children: string;
};

export function SectionHeader({ children }: Props) {
  return (
    <Text className="mb-3 mt-6 text-xs font-semibold uppercase tracking-widest text-text-muted">
      {children}
    </Text>
  );
}
