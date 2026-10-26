import { Text, View } from 'react-native';

type Tone = 'default' | 'primary' | 'warning' | 'error';

const VALUE_TONE: Record<Tone, string> = {
  default: 'text-text-primary',
  primary: 'text-primary',
  warning: 'text-warning',
  error: 'text-error',
};

interface StatCardProps {
  label: string;
  value: string;
  tone?: Tone;
}

/**
 * Compact summary card: big number + small label. Sits in a two- or four-column
 * grid on the Stats screen. Matches the app's card language (border + surface
 * background, rounded-2xl).
 */
export function StatCard({ label, value, tone = 'default' }: StatCardProps) {
  return (
    <View className="min-w-0 flex-1 rounded-2xl border border-border bg-surface px-4 py-3">
      <Text className={`text-3xl font-bold ${VALUE_TONE[tone]}`} numberOfLines={1}>
        {value}
      </Text>
      <Text className="mt-1 text-xs font-semibold uppercase tracking-widest text-text-muted">
        {label}
      </Text>
    </View>
  );
}
