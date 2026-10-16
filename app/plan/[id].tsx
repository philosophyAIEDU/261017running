import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Card, Muted } from '../../src/components/Card';
import { ProgressBar } from '../../src/components/ProgressRing';
import { Screen } from '../../src/components/Screen';
import { getRepositories } from '../../src/db/database';
import { cancelWorkoutReminders, scheduleNextWorkoutReminder } from '../../src/features/workouts/planReminders';
import { getPlan, nextWorkout, planCompletion, toggleWorkoutComplete } from '../../src/features/workouts/trainingPlans';
import { useAsync } from '../../src/hooks/useAsync';
import { bumpData, useDataVersion } from '../../src/store/dataStore';
import { useTheme } from '../../src/theme/theme';
import { eventTime } from '../../src/utils/date';
import { newId } from '../../src/utils/id';

export default function PlanDetailScreen(): React.JSX.Element {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const plan = getPlan(id);
  const version = useDataVersion();
  const repos = getRepositories();
  const progressList = useAsync(() => repos.plans.list(), [version]);
  if (!plan) return <Screen><Muted>플랜을 찾을 수 없어요.</Muted></Screen>;
  const color = t.mode(plan.activityType);
  const progress = progressList.data?.find((p) => p.planId === plan.id && p.active) ?? null;
  const next = progress ? nextWorkout(plan, progress) : null;

  const start = async (): Promise<void> => {
    const now = eventTime();
    // 한 번에 하나의 플랜만 진행한다.
    for (const p of progressList.data ?? []) if (p.active) await repos.plans.save({ ...p, active: false, updatedAt: now });
    await repos.plans.save({ id: newId(), planId: plan.id, startedAt: now, completedWorkoutIds: [], active: true, createdAt: now, updatedAt: now });
    bumpData();
  };

  const stop = (): void => {
    if (!progress) return;
    Alert.alert('플랜을 그만둘까요?', '진행 기록은 남지만 홈 화면에 오늘의 훈련이 표시되지 않아요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '그만두기',
        style: 'destructive',
        onPress: () =>
          void repos.plans.save({ ...progress, active: false, updatedAt: eventTime() }).then(() => {
            void cancelWorkoutReminders();
            bumpData();
          }),
      },
    ]);
  };

  /** 완료 체크 → 다음 훈련을 로컬 알림으로 예약(다음 날 오전 7시) */
  const toggle = async (workoutId: string): Promise<void> => {
    if (!progress) return;
    const updated = toggleWorkoutComplete(progress, workoutId, eventTime());
    await repos.plans.save(updated);
    bumpData();
    const upcoming = nextWorkout(plan, updated);
    if (upcoming && updated.completedWorkoutIds.includes(workoutId)) {
      const ok = await scheduleNextWorkoutReminder(upcoming.workout).catch(() => false);
      if (ok) Alert.alert('잘했어요! 💪', `내일 오전 7시에 다음 훈련(${upcoming.workout.title})을 알려드릴게요.`);
    }
  };

  return (
    <Screen>
      <Text style={{ color: t.text, fontSize: 22, fontWeight: '800' }}>
        {plan.icon} {plan.title}
      </Text>
      <Muted>{plan.description}</Muted>
      {progress ? (
        <Card accent={color}>
          <ProgressBar progress={planCompletion(plan, progress)} color={color} />
          {next ? (
            <>
              <Text style={{ color: t.text, fontWeight: '700' }}>
                오늘의 훈련 · {next.week}주차 {next.workout.title}
              </Text>
              <Button title="훈련 시작" color={color} onPress={() => router.push({ pathname: '/record', params: { planId: plan.id, workoutId: next.workout.id } })} />
            </>
          ) : (
            <Text style={{ color: t.success, fontWeight: '800' }}>🎉 플랜을 모두 완료했어요!</Text>
          )}
          <Button title="플랜 그만두기" variant="ghost" color={t.danger} onPress={stop} />
        </Card>
      ) : (
        <Button title="이 플랜 시작하기" big color={color} onPress={() => void start()} />
      )}
      {plan.weeks.map((w) => (
        <Card key={w.week} title={`${w.week}주차`}>
          {w.workouts.map((wo) => {
            const done = progress?.completedWorkoutIds.includes(wo.id) ?? false;
            return (
              <Pressable key={wo.id} accessibilityRole="checkbox" accessibilityState={{ checked: done }} disabled={!progress} onPress={() => void toggle(wo.id)} style={styles.row}>
                <Text style={{ fontSize: 22 }}>{done ? '✅' : '⬜️'}</Text>
                <View style={styles.flex}>
                  <Text style={{ color: t.text, fontWeight: '600', textDecorationLine: done ? 'line-through' : 'none' }}>{wo.title}</Text>
                  <Text style={{ color: t.subtext, fontSize: 12 }}>{wo.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 6, minHeight: 48 },
  flex: { flex: 1 },
});
