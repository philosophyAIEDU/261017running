import type { ComponentRef, Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { ACTIVITY_CONFIGS } from '../features/activity/activityConfig';
import { formatDistanceValue, formatDuration, formatPaceValue, formatSpeedValue, formatDate, unitLabel } from '../utils/format';
import { getBounds } from '../utils/geo';
import type { Activity, DistanceUnit, LatLng } from '../types';

// 공유 이미지용 카드. 기기 안에서 react-native-view-shot으로 캡처하며 서버에 업로드하지 않는다.
// 경로는 프라이버시 존을 숨긴 좌표를 받아 SVG로 그린다(지도 타일 없이도 렌더링).

interface ShareCardProps {
  activity: Activity;
  path: LatLng[];
  unit: DistanceUnit;
  ref?: Ref<ComponentRef<typeof View>>;
}

const SIZE = 360;

function project(path: LatLng[], size: number, pad: number): string {
  const b = getBounds(path);
  if (!b) return '';
  const midLat = ((b.minLat + b.maxLat) / 2) * (Math.PI / 180);
  const w = (b.maxLon - b.minLon) * Math.cos(midLat) || 1e-9;
  const h = b.maxLat - b.minLat || 1e-9;
  const scale = (size - pad * 2) / Math.max(w, h);
  const offX = (size - w * scale) / 2;
  const offY = (size - h * scale) / 2;
  return path.map((p) => `${(offX + (p.longitude - b.minLon) * Math.cos(midLat) * scale).toFixed(1)},${(offY + (b.maxLat - p.latitude) * scale).toFixed(1)}`).join(' ');
}

export function ShareCard({ activity, path, unit, ref }: ShareCardProps): React.JSX.Element {
  const c = ACTIVITY_CONFIGS[activity.type];
  const primary = c.primaryMetric === 'pace' ? `${formatPaceValue(activity.avgSpeedMps, unit)}/${unitLabel(unit)}` : `${formatSpeedValue(activity.avgSpeedMps, unit)} ${unit === 'km' ? 'km/h' : 'mph'}`;
  return (
    <View ref={ref} collapsable={false} style={[styles.card, { backgroundColor: c.color }]}>
      <View style={styles.header}>
        <Text style={styles.icon}>{c.icon}</Text>
        <View>
          <Text style={styles.title}>{activity.title}</Text>
          <Text style={styles.date}>{formatDate(activity.startedAt)}</Text>
        </View>
      </View>
      {path.length > 1 ? (
        <Svg width={SIZE - 40} height={220} viewBox={`0 0 ${SIZE} ${SIZE}`} preserveAspectRatio="xMidYMid meet">
          <Polyline points={project(path, SIZE, 24)} fill="none" stroke="#FFFFFF" strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      ) : (
        <View style={{ height: 40 }} />
      )}
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.value}>{formatDistanceValue(activity.distanceM, unit)}</Text>
          <Text style={styles.label}>{unitLabel(unit)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.value}>{formatDuration(activity.durationSec)}</Text>
          <Text style={styles.label}>시간</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.value}>{primary}</Text>
          <Text style={styles.label}>{c.primaryMetric === 'pace' ? '평균 페이스' : '평균 속도'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: SIZE, padding: 20, borderRadius: 24, gap: 12, alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'flex-start' },
  icon: { fontSize: 36 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  date: { color: '#FFFFFFCC', fontSize: 13 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch' },
  stat: { alignItems: 'center', flex: 1 },
  value: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  label: { color: '#FFFFFFCC', fontSize: 12 },
});
