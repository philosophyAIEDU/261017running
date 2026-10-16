import { StyleSheet, Text, View } from 'react-native';
import { SmallStat } from './BigStat';
import { ACTIVITY_CONFIGS, type SecondaryMetric } from '../features/activity/activityConfig';
import { useTheme } from '../theme/theme';
import { formatDistance, formatDuration, formatElevation, formatNumber, formatPace, formatSpeed } from '../utils/format';
import type { Activity, DistanceUnit, Split } from '../types';

export interface StatItem {
  key: string;
  label: string;
  value: string;
}

/** 모드 설정(primaryMetric, secondaryMetrics)에 맞는 요약 지표 목록 */
export function summaryItems(a: Activity, unit: DistanceUnit): StatItem[] {
  const c = ACTIVITY_CONFIGS[a.type];
  const items: StatItem[] = [];
  if (c.primaryMetric === 'pace') {
    items.push({ key: 'avgPace', label: '평균 페이스', value: formatPace(a.avgSpeedMps, unit) });
  } else {
    items.push({ key: 'avgSpeed', label: '평균 속도', value: formatSpeed(a.avgSpeedMps, unit) });
    if (!a.isIndoor) items.push({ key: 'maxSpeed', label: '최고 속도', value: formatSpeed(a.maxSpeedMps, unit) });
  }
  const add = (m: SecondaryMetric): void => {
    switch (m) {
      case 'distance':
        items.unshift({ key: 'distance', label: '거리', value: formatDistance(a.distanceM, unit) });
        break;
      case 'duration':
        items.splice(1, 0, { key: 'duration', label: '시간', value: formatDuration(a.durationSec) });
        break;
      case 'steps':
        if (a.steps !== null) items.push({ key: 'steps', label: '걸음 수', value: `${formatNumber(a.steps)}보` });
        break;
      case 'elevation':
        if (!a.isIndoor) items.push({ key: 'elevation', label: '누적 상승', value: formatElevation(a.elevationGainM) });
        break;
      case 'calories':
        items.push({ key: 'calories', label: '칼로리', value: `${a.calories} kcal` });
        break;
      case 'heartRate':
        if (a.details.avgHeartRate !== null) items.push({ key: 'heartRate', label: '평균 심박', value: `${a.details.avgHeartRate} bpm` });
        break;
      case 'cadence':
        if (a.details.avgCadence !== null) items.push({ key: 'cadence', label: '케이던스', value: `${a.details.avgCadence} ${a.type === 'ride' ? 'rpm' : 'spm'}` });
        break;
    }
  };
  c.secondaryMetrics.forEach(add);
  return items;
}

export function ActivityStats({ activity, unit }: { activity: Activity; unit: DistanceUnit }): React.JSX.Element {
  return (
    <View style={styles.grid} testID="activity-stats">
      {summaryItems(activity, unit).map((i) => (
        <View key={i.key} style={styles.cell} testID={`stat-${i.key}`}>
          <SmallStat label={i.label} value={i.value} />
        </View>
      ))}
    </View>
  );
}

export function SplitTable({ splits, type, unit }: { splits: Split[]; type: Activity['type']; unit: DistanceUnit }): React.JSX.Element {
  const t = useTheme();
  const c = ACTIVITY_CONFIGS[type];
  if (splits.length === 0) return <Text style={{ color: t.subtext }}>스플릿이 없습니다</Text>;
  const fastest = Math.max(...splits.map((s) => s.avgSpeedMps));
  const color = t.mode(type);
  return (
    <View testID="split-table">
      <View style={[styles.splitRow, { borderColor: t.border }]}>
        <Text style={[styles.splitHead, { color: t.subtext, width: 44 }]}>구간</Text>
        <Text style={[styles.splitHead, { color: t.subtext, flex: 1 }]}>{c.primaryMetric === 'pace' ? '페이스' : '속도'}</Text>
        <Text style={[styles.splitHead, { color: t.subtext, width: 70, textAlign: 'right' }]}>시간</Text>
        <Text style={[styles.splitHead, { color: t.subtext, width: 54, textAlign: 'right' }]}>상승</Text>
      </View>
      {splits.map((s) => (
        <View key={s.index} style={[styles.splitRow, { borderColor: t.border }]}>
          <Text style={{ color: t.text, width: 44, fontWeight: '700' }}>{s.distanceM < c.splitEveryKm * 1000 - 1 ? `${(s.distanceM / 1000).toFixed(1)}` : s.index * c.splitEveryKm}</Text>
          <View style={styles.barWrap}>
            <View style={[styles.bar, { backgroundColor: color, width: `${Math.max(10, (s.avgSpeedMps / fastest) * 100)}%`, opacity: s.avgSpeedMps === fastest ? 1 : 0.55 }]} />
            <Text style={[styles.barText, { color: t.text }]}>{c.primaryMetric === 'pace' ? formatPace(s.avgSpeedMps, unit) : formatSpeed(s.avgSpeedMps, unit)}</Text>
          </View>
          <Text style={{ color: t.text, width: 70, textAlign: 'right' }}>{formatDuration(s.durationSec)}</Text>
          <Text style={{ color: t.subtext, width: 54, textAlign: 'right' }}>{Math.round(s.elevationGainM)}m</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  cell: { width: '33.3%' },
  splitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  splitHead: { fontSize: 12, fontWeight: '700' },
  barWrap: { flex: 1, justifyContent: 'center', height: 24 },
  bar: { position: 'absolute', left: 0, top: 2, bottom: 2, borderRadius: 4 },
  barText: { paddingLeft: 6, fontWeight: '700', fontSize: 13 },
});
