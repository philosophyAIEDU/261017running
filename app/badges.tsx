import { StyleSheet, Text, View } from 'react-native';
import { Card, Muted } from '../src/components/Card';
import { ProgressBar } from '../src/components/ProgressRing';
import { Screen } from '../src/components/Screen';
import { getRepositories } from '../src/db/database';
import { ACTIVITY_CONFIGS } from '../src/features/activity/activityConfig';
import { badgeProgressList } from '../src/features/gamification/badges';
import { monthlyChallengeProgress } from '../src/features/gamification/challenges';
import { computeWeeklyStreak } from '../src/features/gamification/streak';
import { useActivitySummaries } from '../src/hooks/useActivities';
import { useAsync } from '../src/hooks/useAsync';
import { useNow } from '../src/hooks/useNow';
import { useDataVersion } from '../src/store/dataStore';
import { useTheme } from '../src/theme/theme';
import { formatDate } from '../src/utils/format';

export default function BadgesScreen(): React.JSX.Element {
  const t = useTheme();
  const version = useDataVersion();
  const earned = useAsync(() => getRepositories().badges.list(), [version]);
  const { data } = useActivitySummaries();
  const list = data ?? [];
  const items = badgeProgressList(earned.data ?? []);
  const now = useNow();
  const streak = computeWeeklyStreak(list.map((a) => a.startedAt), now);
  const challenges = monthlyChallengeProgress(list, now);
  return (
    <Screen>
      <Card>
        <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>🔥 {streak.current}주 연속</Text>
        <Muted>최장 {streak.longest}주 · 모드와 관계없이 매주 한 번 이상 활동하면 이어져요.</Muted>
      </Card>
      <Card title="이번 달 챌린지">
        {challenges.map((c) => (
          <View key={c.challenge.id} style={styles.challenge}>
            <Text style={{ color: t.text }}>
              {c.completed ? '✅' : c.challenge.icon} {c.challenge.title}
            </Text>
            <ProgressBar progress={c.progress} color={c.challenge.activityType ? t.mode(c.challenge.activityType) : t.success} />
          </View>
        ))}
      </Card>
      <Card title={`배지 ${items.filter((i) => i.earned).length}/${items.length}`}>
        <View style={styles.grid}>
          {items.map(({ badge, earned: e }) => (
            <View key={badge.id} style={[styles.badge, { borderColor: e ? (badge.activityType ? t.mode(badge.activityType) : t.text) : t.border, opacity: e ? 1 : 0.4 }]}>
              <Text style={styles.icon}>{badge.icon}</Text>
              <Text style={{ color: t.text, fontWeight: '700', fontSize: 12, textAlign: 'center' }}>{badge.name}</Text>
              <Text style={{ color: t.subtext, fontSize: 10, textAlign: 'center' }}>
                {e ? formatDate(e.earnedAt) : badge.activityType ? ACTIVITY_CONFIGS[badge.activityType].label : '공통'}
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  challenge: { gap: 4, paddingVertical: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: { width: '31%', borderWidth: 2, borderRadius: 12, padding: 8, alignItems: 'center', gap: 2 },
  icon: { fontSize: 30 },
});
