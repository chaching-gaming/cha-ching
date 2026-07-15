import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { useTheme } from '@/providers/theme';
import { Avatar, Badge, ScreenHeader, SectionHeader } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { useMemberStats, type SettlementStatus } from '@/hooks/use-member-stats';
import { balanceColorClass, formatBalance } from '@/lib/format-balance';

const ROLE_LABELS: Record<string, string> = {
  PLAYER: 'Player',
  ATTESTOR: 'Attestor',
  ADMIN: 'Admin',
};

const SETTLEMENT_BADGE_VARIANTS: Record<SettlementStatus, 'warning' | 'success' | 'error'> = {
  PENDING: 'warning',
  SETTLED: 'success',
  DISPUTED: 'error',
};

const SETTLEMENT_BADGE_LABELS: Record<SettlementStatus, string> = {
  PENDING: 'Pending',
  SETTLED: 'Settled',
  DISPUTED: 'Disputed',
};

function formatMemberSince(joinedAt: string): string {
  const date = new Date(joinedAt);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function StatRow({
  label,
  value,
  valueClassName,
  subtitle,
  badge,
  isLast = false,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center justify-between px-4 py-4 ${isLast ? '' : 'border-b border-border/40'}`}
    >
      <View className="flex-1">
        <Text className="text-base font-medium text-text-primary">{label}</Text>
        {subtitle ? <Text className="mt-0.5 text-sm text-text-muted">{subtitle}</Text> : null}
      </View>
      <View className="flex-row items-center gap-2">
        {badge}
        <Text className={`text-base font-bold ${valueClassName ?? 'text-text-primary'}`}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function formatChipsWithCount(chips: number, count: number): { value: string; subtitle: string } {
  const formattedChips = chips.toLocaleString('en-US');
  const countLabel = count === 1 ? 'donation' : 'donations';
  return {
    value: `${formattedChips} chips`,
    subtitle: `across ${count} ${countLabel}`,
  };
}

export default function MemberStatsScreen() {
  const { colors } = useTheme();
  const { userId, roomId } = useLocalSearchParams<{ userId: string; roomId: string }>();
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;

  const { data: stats, isLoading } = useMemberStats(roomId ?? null, userId ?? null);

  if (isLoading) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="" showBack backIconSize={28} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  if (!stats) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="" showBack backIconSize={28} />
        <View className="flex-1 items-center justify-center">
          <Text className="text-lg text-text-secondary">Member not found</Text>
        </View>
      </View>
    );
  }

  const isSelf = stats.user_id === currentUserId;
  const isPastMember = !!stats.left_at;
  const role = stats.role ?? 'PLAYER';
  const roleVariant = role.toLowerCase() as 'admin' | 'player' | 'attestor';
  const statusLabel = stats.left_reason === 'REMOVED' ? 'Removed' : 'Left';

  // Performance
  const netProfitLoss = stats.balance - stats.starting_chips;
  const netProfitLossFormatted = formatBalance(netProfitLoss);
  const netProfitLossColor = balanceColorClass(netProfitLoss);
  const balanceFormatted = formatBalance(stats.balance);
  const balanceColor = balanceColorClass(stats.balance);

  const totalBets = stats.wins + stats.losses;
  const winRateFormatted = totalBets > 0 ? `${Math.round((stats.wins / totalBets) * 100)}%` : '—';
  const recordFormatted = totalBets > 0 ? `${stats.wins}W / ${stats.losses}L` : '—';

  // Betting activity
  const totalWageredFormatted =
    stats.total_wagered > 0 ? `${stats.total_wagered.toLocaleString('en-US')} chips` : '—';
  const avgBetFormatted =
    totalBets > 0
      ? `${Math.round(stats.total_wagered / totalBets).toLocaleString('en-US')} chips`
      : '—';
  const biggestWinFormatted =
    stats.biggest_win_net > 0 ? formatBalance(stats.biggest_win_net) : '—';
  const biggestLossFormatted =
    stats.biggest_loss_net > 0 ? formatBalance(-stats.biggest_loss_net) : '—';
  const roiFormatted =
    stats.total_wagered > 0 ? `${((netProfitLoss / stats.total_wagered) * 100).toFixed(1)}%` : '—';
  const roiColor = stats.total_wagered > 0 ? balanceColorClass(netProfitLoss) : 'text-text-primary';

  // Generosity
  const donated = formatChipsWithCount(stats.chips_donated, stats.donation_count);
  const received = formatChipsWithCount(stats.chips_received, stats.received_count);

  // Settlement badge (read-only)
  const settlementBadge = stats.settlement_status ? (
    <Badge
      variant={SETTLEMENT_BADGE_VARIANTS[stats.settlement_status]}
      label={SETTLEMENT_BADGE_LABELS[stats.settlement_status]}
      className="px-2 py-0.5"
      labelClassName="text-[10px] font-bold tracking-wide"
    />
  ) : null;

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="" showBack backIconSize={28} />

      <ScrollView contentContainerClassName="px-5 pb-12">
        {/* Profile Header */}
        <View className="items-center pt-4">
          <Avatar uri={stats.avatar_url} fallback={stats.display_name ?? '?'} size="xl" />
          <Text className="mt-4 text-center text-2xl font-bold text-text-primary">
            {stats.display_name ?? 'Unknown'}
            {isSelf ? <Text className="text-lg text-text-secondary"> (you)</Text> : null}
          </Text>

          {/* Badges */}
          <View className="mt-3 flex-row items-center gap-2">
            <Badge
              variant={roleVariant}
              label={ROLE_LABELS[role] ?? role}
              className="px-4 py-2"
              labelClassName="text-sm font-semibold"
            />
            {isPastMember ? (
              <Badge
                variant="default"
                label={statusLabel}
                className="bg-surface-alt px-4 py-2"
                labelClassName="text-sm font-semibold text-text-muted"
              />
            ) : null}
          </View>
        </View>

        {/* Performance Overview */}
        <SectionHeader>Performance</SectionHeader>
        <View className="overflow-hidden rounded-2xl border border-border bg-surface">
          <StatRow label="Current Balance" value={balanceFormatted} valueClassName={balanceColor} />
          <StatRow label="Win Rate" value={winRateFormatted} />
          <StatRow label="Record" value={recordFormatted} />
          <StatRow
            label="Net Profit / Loss"
            value={netProfitLossFormatted}
            valueClassName={netProfitLossColor}
            badge={settlementBadge}
            isLast
          />
        </View>

        {/* Betting Activity */}
        <SectionHeader>Betting Activity</SectionHeader>
        <View className="overflow-hidden rounded-2xl border border-border bg-surface">
          <StatRow label="Total Wagered" value={totalWageredFormatted} />
          <StatRow label="Avg Bet Size" value={avgBetFormatted} />
          <StatRow
            label="Biggest Win"
            value={biggestWinFormatted}
            valueClassName={stats.biggest_win_net > 0 ? 'text-primary' : 'text-text-primary'}
          />
          <StatRow
            label="Biggest Loss"
            value={biggestLossFormatted}
            valueClassName={stats.biggest_loss_net > 0 ? 'text-error' : 'text-text-primary'}
          />
          <StatRow label="ROI" value={roiFormatted} valueClassName={roiColor} isLast />
        </View>

        {/* Generosity */}
        <SectionHeader>Generosity</SectionHeader>
        <View className="overflow-hidden rounded-2xl border border-border bg-surface">
          <StatRow
            label="Chips Donated"
            value={donated.value}
            subtitle={stats.donation_count > 0 ? donated.subtitle : undefined}
          />
          <StatRow
            label="Chips Received"
            value={received.value}
            subtitle={stats.received_count > 0 ? received.subtitle : undefined}
            isLast
          />
        </View>
      </ScrollView>
    </View>
  );
}
