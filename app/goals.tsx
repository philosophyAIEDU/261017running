import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button } from '../src/components/Button';
import { Card, Muted } from '../src/components/Card';
import { Field, parseNumber } from '../src/components/Field';
import { ModeSelector } from '../src/components/ModeSelector';
import { ProgressRing } from '../src/components/ProgressRing';
import { Screen } from '../src/components/Screen';
import { Segmented } from '../src/components/Segmented';
import { getRepositories } from '../src/db/database';
import { ACTIVITY_CONFIGS } from '../src/features/activity/activityConfig';
import { PERIOD_LABELS, goalProgress } from '../src/features/gamification/goals';
import { useActivitySummaries } from '../src/hooks/useActivities';
import { useNow } from '../src/hooks/useNow';
import { useAsync } from '../src/hooks/useAsync';
import { bumpData, useDataVersion } from '../src/store/dataStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { useTheme } from '../src/theme/theme';
import { formatDistance, formatNumber, unitLabel, unitToMeters } from '../src/utils/format';
import { newId } from '../src/utils/id';
import type { ActivityType, GoalPeriod } from '../src/types';
import { eventTime } from '../src/utils/date';

export default function GoalsScreen(): React.JSX.Element {
  const t = useTheme();
  const unit = useSettingsStore((s) => s.settings.unit);
  const version = useDataVersion();
  const goals = useAsync(() => getRepositories().goals.list(), [version]);
  const { data } = useActivitySummaries();
  const [kind, setKind] = useState<'distance' | 'steps'>('distance');
  const [type, setType] = useState<ActivityType>('run');
  const [period, setPeriod] = useState<Exclude<GoalPeriod, 'day'>>('week');
  const [target, setTarget] = useState('');
  const now = useNow();

  const add = async (): Promise<void> => {
    const v = parseNumber(target);
    if (!v || v <= 0) {
      Alert.alert('목표 값을 입력하세요');
      return;
    }
    const ts = eventTime();
    await getRepositories().goals.save({
      id: newId(),
      activityType: kind === 'steps' ? null : type,
      period: kind === 'steps' ? 'day' : period,
      metric: kind,
      target: kind === 'steps' ? Math.round(v) : unitToMeters(v, unit),
      createdAt: ts,
      updatedAt: ts,
    });
    setTarget('');
    bumpData();
  };

  const remove = async (id: string): Promise<void> => {
    await getRepositories().goals.delete(id);
    bumpData();
  };

  return (
    <Screen>
      <View style={styles.grid}>
        {(goals.data ?? []).map((g) => {
          const p = goalProgress(g, data ?? [], now);
          return (
            <Card key={g.id} style={styles.cell}>
              <ProgressRing
                progress={p.progress}
                color={g.activityType ? t.mode(g.activityType) : t.success}
                label={`${PERIOD_LABELS[g.period]} ${g.activityType ? ACTIVITY_CONFIGS[g.activityType].label : '걸음 수'}`}
                sublabel={g.metric === 'distance' ? `${formatDistance(p.value, unit, 1)} / ${formatDistance(g.target, unit, 0)}` : `${formatNumber(p.value)} / ${formatNumber(g.target)}보`}
              />
              <Button title="삭제" variant="ghost" color={t.danger} onPress={() => void remove(g.id)} />
            </Card>
          );
        })}
      </View>
      <Card title="새 목표">
        <Segmented
          options={[
            { value: 'distance', label: '거리 목표' },
            { value: 'steps', label: '하루 걸음 수' },
          ]}
          value={kind}
          onChange={setKind}
        />
        {kind === 'distance' ? (
          <>
            <ModeSelector value={type} onChange={(v) => v && setType(v)} compact />
            <Segmented
              options={[
                { value: 'week', label: '주간' },
                { value: 'month', label: '월간' },
                { value: 'year', label: '연간' },
              ]}
              value={period}
              onChange={setPeriod}
              color={t.mode(type)}
            />
          </>
        ) : (
          <Muted>모든 모드의 걸음 수를 합산해요. 하루 1만 보에 도전해 보세요!</Muted>
        )}
        <Field label={kind === 'distance' ? `목표 거리 (${unitLabel(unit)})` : '목표 걸음 수'} value={target} onChangeText={setTarget} keyboardType="number-pad" placeholder={kind === 'distance' ? '예) 20' : '예) 10000'} />
        <Button title="목표 추가" color={kind === 'distance' ? t.mode(type) : t.success} onPress={() => void add()} />
      </Card>
      {(goals.data ?? []).length === 0 ? <Text style={{ color: t.subtext }}>목표를 추가하면 홈 화면에 진행률 링으로 보여요.</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '48%', alignItems: 'center' },
});
