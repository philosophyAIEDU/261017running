import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Card, Muted } from '../../src/components/Card';
import { Field } from '../../src/components/Field';
import { RouteMap } from '../../src/components/RouteMap';
import { Screen } from '../../src/components/Screen';
import { getRepositories } from '../../src/db/database';
import { matchSegmentsForActivity } from '../../src/features/activity/activityService';
import { buildSegmentFromRoute } from '../../src/features/analysis/segments';
import { useAsync } from '../../src/hooks/useAsync';
import { bumpData } from '../../src/store/dataStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useTheme } from '../../src/theme/theme';
import { eventTime } from '../../src/utils/date';
import { formatDistance } from '../../src/utils/format';
import { nearestPointIndex } from '../../src/utils/geo';
import { newId } from '../../src/utils/id';
import type { LatLng } from '../../src/types';

/** 지난 활동 경로에서 시작점과 끝점을 골라 "내 구간"으로 저장한다. */
export default function SegmentCreateScreen(): React.JSX.Element {
  const t = useTheme();
  const unit = useSettingsStore((s) => s.settings.unit);
  const { id } = useLocalSearchParams<{ id: string }>();
  const repos = getRepositories();
  const { data } = useAsync(async () => ({ activity: await repos.activities.get(id), points: await repos.activities.getTrackPoints(id) }), [id]);
  const [selecting, setSelecting] = useState<'start' | 'end'>('start');
  const [startIdx, setStartIdx] = useState<number | null>(null);
  const [endIdx, setEndIdx] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const points = useMemo(() => data?.points ?? [], [data]);
  const path = useMemo(() => points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })), [points]);
  const preview = startIdx !== null && endIdx !== null ? buildSegmentFromRoute(points, startIdx, endIdx, data?.activity?.details.pauses ?? []) : null;
  const color = data?.activity ? t.mode(data.activity.type) : t.text;

  const onPress = (coord: LatLng): void => {
    const idx = nearestPointIndex(path, coord);
    if (idx < 0) return;
    if (selecting === 'start') {
      setStartIdx(idx);
      setSelecting('end');
    } else {
      setEndIdx(idx);
    }
  };

  const nudge = (which: 'start' | 'end', delta: number): void => {
    const clamp = (v: number): number => Math.max(0, Math.min(points.length - 1, v));
    if (which === 'start' && startIdx !== null) setStartIdx(clamp(startIdx + delta));
    if (which === 'end' && endIdx !== null) setEndIdx(clamp(endIdx + delta));
  };

  const save = async (): Promise<void> => {
    if (!preview || !data?.activity) return;
    setSaving(true);
    const now = eventTime();
    const segment = { id: newId(), name: name.trim() || '내 구간', ...preview, sourceActivityId: data.activity.id, createdAt: now, updatedAt: now };
    await repos.segments.save(segment);
    // 지난 기록에서도 같은 구간을 찾아 기록을 채운다.
    const summaries = (await repos.activities.listSummaries()).filter((s) => !s.isIndoor);
    for (const s of summaries) {
      const full = await repos.activities.get(s.id);
      if (full) await matchSegmentsForActivity(repos, full, await repos.activities.getTrackPoints(s.id), now);
    }
    bumpData();
    setSaving(false);
    router.replace({ pathname: '/segment/[id]', params: { id: segment.id } });
  };

  const markers = [
    ...(startIdx !== null ? [{ id: 's', coordinate: path[startIdx], title: '구간 시작', color: 'green' }] : []),
    ...(endIdx !== null ? [{ id: 'e', coordinate: path[endIdx], title: '구간 끝', color: 'red' }] : []),
  ];

  return (
    <Screen>
      <Muted>지도에서 {selecting === 'start' ? '구간 시작점' : '구간 끝점'}을 눌러 선택하세요. ◀ ▶ 버튼으로 미세 조정할 수 있어요.</Muted>
      <RouteMap path={path} color={color} onPress={onPress} markers={markers} highlight={preview?.path} style={{ height: 320 }} />
      <Card>
        {(['start', 'end'] as const).map((w) => (
          <View key={w} style={styles.row}>
            <Text style={{ color: t.text, flex: 1, fontWeight: '700' }}>
              {w === 'start' ? '시작' : '끝'}: {(w === 'start' ? startIdx : endIdx) ?? '선택 안 됨'}
            </Text>
            <Button title="◀" variant="secondary" onPress={() => nudge(w, -3)} />
            <Button title="▶" variant="secondary" onPress={() => nudge(w, 3)} />
            <Button title="다시" variant="ghost" onPress={() => setSelecting(w)} />
          </View>
        ))}
        <Text style={{ color: t.text }}>{preview ? `구간 거리 ${formatDistance(preview.distanceM, unit)}` : startIdx !== null && endIdx !== null ? '끝점은 시작점 이후, 100m 이상이어야 해요.' : ''}</Text>
      </Card>
      <Field label="구간 이름" value={name} onChangeText={setName} placeholder="예) 집 앞 언덕, 한강 1km" />
      <Button
        title="구간 저장"
        big
        color={color}
        disabled={!preview}
        loading={saving}
        onPress={() =>
          void save().catch((e: unknown) => {
            setSaving(false);
            Alert.alert('저장 실패', e instanceof Error ? e.message : String(e));
          })
        }
      />
      <Muted>시작점 25m 안을 지나 끝점 25m 안에 도착하고, 이동 거리가 구간 거리의 ±15% 이내일 때 기록으로 인정돼요. 같은 구간이라도 모드별로 순위를 따로 매겨요.</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
