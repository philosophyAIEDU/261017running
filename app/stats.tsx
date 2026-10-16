import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SmallStat } from '../src/components/BigStat';
import { Button } from '../src/components/Button';
import { CalendarHeatmap } from '../src/components/CalendarHeatmap';
import { Card, Muted } from '../src/components/Card';
import { MetricChart } from '../src/components/MetricChart';
import { ModeSelector } from '../src/components/ModeSelector';
import { Screen } from '../src/components/Screen';
import { Segmented } from '../src/components/Segmented';
import { buildHeatmap, computePeriodStats, percentChange, type StatsPeriod } from '../src/features/analysis/stats';
import { useActivitySummaries } from '../src/hooks/useActivities';
import { useNow } from '../src/hooks/useNow';
import { useSettingsStore } from '../src/store/settingsStore';
import { useTheme } from '../src/theme/theme';
import { addDays, addMonths, addYears, startOfMonth } from '../src/utils/date';
import { formatDistance, formatDuration, metersToUnit, unitLabel } from '../src/utils/format';
import type { ActivityType } from '../src/types';

function periodTitle(period: StatsPeriod, start: number): string {
  const d = new Date(start);
  if (period === 'week') {
    const e = new Date(addDays(start, 6));
    return `${d.getMonth() + 1}/${d.getDate()} ~ ${e.getMonth() + 1}/${e.getDate()}`;
  }
  if (period === 'month') return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  return `${d.getFullYear()}년`;
}

export default function StatsScreen(): React.JSX.Element {
  const t = useTheme();
  const unit = useSettingsStore((s) => s.settings.unit);
  const [type, setType] = useState<ActivityType | null>(null);
  const [period, setPeriod] = useState<StatsPeriod>('week');
  const now = useNow();
  const [ref, setRef] = useState(() => Date.now());
  const { data } = useActivitySummaries();
  const list = data ?? [];
  const stats = computePeriodStats(list, period, ref, type);
  const color = type ? t.mode(type) : t.text;
  const change = percentChange(stats.totals.distanceM, stats.previousYear.distanceM);
  const monthStart = startOfMonth(ref);
  const heat = buildHeatmap(type ? list.filter((a) => a.type === type) : list, monthStart, Math.round((addMonths(monthStart, 1) - monthStart) / 86_400_000));
  const shift = (dir: number): void => setRef(period === 'week' ? addDays(ref, dir * 7) : period === 'month' ? addMonths(ref, dir) : addYears(ref, dir));

  return (
    <Screen>
      <ModeSelector value={type} onChange={setType} allowAll compact />
      <Segmented
        options={[
          { value: 'week', label: '주간' },
          { value: 'month', label: '월간' },
          { value: 'year', label: '연간' },
        ]}
        value={period}
        onChange={setPeriod}
        color={type ? color : undefined}
      />
      <View style={styles.nav}>
        <Button title="‹" variant="secondary" onPress={() => shift(-1)} />
        <Text style={{ color: t.text, fontWeight: '800', fontSize: 17 }}>{periodTitle(period, stats.start)}</Text>
        <Button title="›" variant="secondary" onPress={() => shift(1)} disabled={stats.end > now} />
      </View>
      <Card>
        <View style={styles.grid}>
          <SmallStat label="거리" value={formatDistance(stats.totals.distanceM, unit, 1)} />
          <SmallStat label="횟수" value={`${stats.totals.count}회`} />
          <SmallStat label="시간" value={formatDuration(stats.totals.durationSec)} />
        </View>
        <View style={styles.grid}>
          <SmallStat label="상승 고도" value={`${Math.round(stats.totals.elevationGainM)} m`} />
          <SmallStat label="칼로리" value={`${stats.totals.calories.toLocaleString('ko-KR')}`} />
          <SmallStat label="걸음 수" value={stats.totals.steps.toLocaleString('ko-KR')} />
        </View>
        <Muted>
          전년 동기 {formatDistance(stats.previousYear.distanceM, unit, 1)}
          {change !== null ? ` · ${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(0)}%` : ''} ({stats.previousYear.count}회)
        </Muted>
      </Card>
      <Card>
        <MetricChart
          title={`거리 (${unitLabel(unit)})`}
          type="bar"
          data={stats.buckets.map((b, i) => ({ x: i, y: metersToUnit(b.totals.distanceM, unit) }))}
          color={type ? color : t.subtext}
          formatX={(x) => stats.buckets[x]?.label ?? ''}
          formatY={(y) => y.toFixed(0)}
          maxPoints={40}
        />
      </Card>
      <Card title={`${new Date(monthStart).getMonth() + 1}월 캘린더`}>
        <CalendarHeatmap days={heat} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', gap: 8 },
});
