import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Card, Muted } from '../../src/components/Card';
import { ProgressBar, ProgressRing } from '../../src/components/ProgressRing';
import { Screen } from '../../src/components/Screen';
import { getRepositories } from '../../src/db/database';
import { ACTIVITY_CONFIGS, ACTIVITY_TYPES } from '../../src/features/activity/activityConfig';
import { computePeriodStats } from '../../src/features/analysis/stats';
import { daysSince, shouldRemindBackup } from '../../src/features/backup/backupReminder';
import { monthlyChallengeProgress } from '../../src/features/gamification/challenges';
import { PERIOD_LABELS, goalProgress } from '../../src/features/gamification/goals';
import { overallLevel } from '../../src/features/gamification/levels';
import { computeWeeklyStreak } from '../../src/features/gamification/streak';
import { gearAlerts } from '../../src/features/gear/gear';
import { getPlan, nextWorkout } from '../../src/features/workouts/trainingPlans';
import { useActivitySummaries } from '../../src/hooks/useActivities';
import { useNow } from '../../src/hooks/useNow';
import { useAsync } from '../../src/hooks/useAsync';
import { useDataVersion } from '../../src/store/dataStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useTheme } from '../../src/theme/theme';
import { formatDistance, formatDuration, formatNumber } from '../../src/utils/format';

export default function HomeScreen(): React.JSX.Element {
  const t = useTheme();
  const settings = useSettingsStore((s) => s.settings);
  const unit = settings.unit;
  const version = useDataVersion();
  const { data: activities, loading, reload } = useActivitySummaries();
  const extra = useAsync(async () => {
    const repos = getRepositories();
    const [goals, plans, gear, components] = await Promise.all([repos.goals.list(), repos.plans.list(), repos.gear.list(), repos.gear.listComponents()]);
    return { goals, plans, gear, components };
  }, [version]);
  const now = useNow();
  const list = activities ?? [];
  const week = computePeriodStats(list, 'week', now, null);
  const streak = computeWeeklyStreak(list.map((a) => a.startedAt), now);
  const level = overallLevel(list);
  const firstAt = list.length > 0 ? Math.min(...list.map((a) => a.createdAt)) : null;
  const remindBackup = shouldRemindBackup(settings.lastBackupAt, firstAt, now);
  const activePlan = extra.data?.plans.find((p) => p.active);
  const plan = activePlan ? getPlan(activePlan.planId) : undefined;
  const today = plan && activePlan ? nextWorkout(plan, activePlan) : null;
  const challenges = monthlyChallengeProgress(list, now)
    .filter((c) => !c.completed)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3);
  const alerts = extra.data ? gearAlerts(extra.data.gear, extra.data.components, list) : [];
  const goals = (extra.data?.goals ?? []).map((g) => goalProgress(g, list, now));

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      {remindBackup ? (
        <Card accent={t.warning} onPress={() => router.push('/backup')}>
          <Text style={{ color: t.text, fontWeight: '700' }} testID="backup-reminder">
            💾 {settings.lastBackupAt ? `마지막 백업 후 ${daysSince(settings.lastBackupAt, now)}일이 지났어요` : '아직 백업하지 않았어요'}
          </Text>
          <Muted>모든 기록은 이 기기에만 저장돼요. 휴대폰을 잃어버리기 전에 백업 파일을 만들어 두세요.</Muted>
        </Card>
      ) : null}

      <Card title="이번 주">
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={[styles.big, { color: t.text }]}>{formatDistance(week.totals.distanceM, unit, 1)}</Text>
            <Muted>
              {week.totals.count}회 · {formatDuration(week.totals.durationSec)}
            </Muted>
          </View>
          <View style={styles.right}>
            <Text style={{ color: t.text, fontSize: 22, fontWeight: '800' }}>🔥 {streak.current}주</Text>
            <Muted>{streak.activeThisWeek ? '연속 기록 중' : streak.current > 0 ? '이번 주 활동하면 유지!' : '이번 주 시작해 보세요'}</Muted>
          </View>
        </View>
        <View style={styles.modes}>
          {ACTIVITY_TYPES.map((type) => {
            const d = computePeriodStats(list, 'week', now, type).totals.distanceM;
            return (
              <Text key={type} style={{ color: t.mode(type), fontWeight: '700' }}>
                {ACTIVITY_CONFIGS[type].icon} {formatDistance(d, unit, 1)}
              </Text>
            );
          })}
        </View>
      </Card>

      <Card title={`레벨 ${level.level}`} onPress={() => router.push('/badges')}>
        <ProgressBar progress={level.progress} color={t.mode(settings.lastActivityType)} />
        <Muted>
          누적 {formatNumber(level.current)}분 · 다음 레벨까지 {formatNumber(level.nextLevelAt - level.current)}분 (활동 시간 기준)
        </Muted>
      </Card>

      {goals.length > 0 ? (
        <Card title="목표" onPress={() => router.push('/goals')}>
          <View style={styles.rings}>
            {goals.slice(0, 3).map((g) => (
              <ProgressRing
                key={g.goal.id}
                progress={g.progress}
                color={g.goal.activityType ? t.mode(g.goal.activityType) : t.success}
                label={`${PERIOD_LABELS[g.goal.period]} ${g.goal.activityType ? ACTIVITY_CONFIGS[g.goal.activityType].label : '걸음'}`}
                sublabel={g.goal.metric === 'distance' ? `${formatDistance(g.value, unit, 1)} / ${formatDistance(g.goal.target, unit, 0)}` : `${formatNumber(g.value)} / ${formatNumber(g.goal.target)}보`}
              />
            ))}
          </View>
        </Card>
      ) : (
        <Card onPress={() => router.push('/goals')}>
          <Text style={{ color: t.text, fontWeight: '700' }}>🎯 목표를 세워 보세요</Text>
          <Muted>모드별 주간/월간/연간 거리 목표와 하루 걸음 수 목표를 설정할 수 있어요.</Muted>
        </Card>
      )}

      {today && plan ? (
        <Card title={`오늘의 훈련 · ${plan.title}`} accent={t.mode(today.workout.activityType)}>
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>
            {today.week}주차 · {today.workout.title}
          </Text>
          <Muted>{today.workout.description}</Muted>
          <Button
            title="이 훈련 시작하기"
            color={t.mode(today.workout.activityType)}
            onPress={() => router.push({ pathname: '/record', params: { planId: plan.id, workoutId: today.workout.id } })}
          />
        </Card>
      ) : null}

      {alerts.length > 0 ? (
        <Card title="장비 점검" accent={t.warning} onPress={() => router.push('/gear')}>
          {alerts.map((a) => (
            <Text key={`${a.gearId}-${a.componentId ?? ''}`} style={{ color: a.level === 'replace' ? t.danger : t.warning }}>
              ⚠️ {a.message}
            </Text>
          ))}
        </Card>
      ) : null}

      {challenges.length > 0 ? (
        <Card title="이번 달 챌린지">
          {challenges.map((c) => (
            <View key={c.challenge.id} style={styles.challenge}>
              <Text style={{ color: t.text }}>
                {c.challenge.icon} {c.challenge.title}
              </Text>
              <ProgressBar progress={c.progress} color={c.challenge.activityType ? t.mode(c.challenge.activityType) : t.success} />
            </View>
          ))}
        </Card>
      ) : null}

      <View style={styles.row}>
        <Button title="📊 통계" variant="secondary" onPress={() => router.push('/stats')} style={styles.flex} />
        <Button title="🏆 개인 기록" variant="secondary" onPress={() => router.push('/records')} style={styles.flex} />
      </View>
      {list.length === 0 ? (
        <Card>
          <Text style={{ color: t.text, fontWeight: '700' }}>첫 활동을 기록해 보세요!</Text>
          <Button title="기록하러 가기" color={t.mode(settings.lastActivityType)} onPress={() => router.push('/record')} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  flex: { flex: 1 },
  right: { alignItems: 'flex-end' },
  big: { fontSize: 32, fontWeight: '800' },
  modes: { flexDirection: 'row', justifyContent: 'space-between' },
  rings: { flexDirection: 'row', gap: 8 },
  challenge: { gap: 4 },
});
