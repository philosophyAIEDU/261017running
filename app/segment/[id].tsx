import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Button } from '../../src/components/Button';
import { Card, Muted } from '../../src/components/Card';
import { ModeSelector } from '../../src/components/ModeSelector';
import { RouteMap } from '../../src/components/RouteMap';
import { Screen } from '../../src/components/Screen';
import { getRepositories } from '../../src/db/database';
import { ACTIVITY_CONFIGS } from '../../src/features/activity/activityConfig';
import { rankEfforts } from '../../src/features/analysis/segments';
import { useAsync } from '../../src/hooks/useAsync';
import { bumpData, useDataVersion } from '../../src/store/dataStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useTheme } from '../../src/theme/theme';
import { formatDate, formatDistance, formatDuration, formatPrimary } from '../../src/utils/format';
import type { ActivityType } from '../../src/types';

/** 구간 기록 순위(모드별 분리) */
export default function SegmentDetailScreen(): React.JSX.Element {
  const t = useTheme();
  const unit = useSettingsStore((s) => s.settings.unit);
  const { id } = useLocalSearchParams<{ id: string }>();
  const version = useDataVersion();
  const [mode, setMode] = useState<ActivityType>('run');
  const repos = getRepositories();
  const { data } = useAsync(async () => ({ segment: await repos.segments.get(id), efforts: await repos.segments.listEfforts(id) }), [id, version]);
  if (!data?.segment) return <Screen><Muted>불러오는 중…</Muted></Screen>;
  const { segment, efforts } = data;
  const ranked = rankEfforts(efforts.filter((e) => e.activityType === mode));
  const remove = (): void =>
    Alert.alert('구간을 삭제할까요?', '이 구간의 모든 기록도 함께 삭제됩니다.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void repos.segments.delete(segment.id).then(() => { bumpData(); router.back(); }) },
    ]);
  return (
    <Screen>
      <Text style={{ color: t.text, fontSize: 22, fontWeight: '800' }}>📍 {segment.name}</Text>
      <Muted>{formatDistance(segment.distanceM, unit)}</Muted>
      <RouteMap path={segment.path} color={t.mode(mode)} style={{ height: 200 }} />
      <ModeSelector value={mode} onChange={(m) => m && setMode(m)} compact />
      <Card title={`${ACTIVITY_CONFIGS[mode].label} 순위`}>
        {ranked.length === 0 ? <Muted>이 모드의 기록이 아직 없어요.</Muted> : null}
        {ranked.map((e) => (
          <Text
            key={e.id}
            style={{ color: e.rank === 1 ? t.mode(mode) : t.text, fontWeight: e.rank === 1 ? '800' : '400', paddingVertical: 4 }}
            onPress={() => router.push({ pathname: '/activity/[id]', params: { id: e.activityId } })}
          >
            {e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : `${e.rank}.`} {formatDuration(e.elapsedSec)} · {formatPrimary(e.distanceM / e.elapsedSec, ACTIVITY_CONFIGS[mode].primaryMetric, unit)} · {formatDate(e.startedAt)}
          </Text>
        ))}
      </Card>
      <Button title="구간 삭제" variant="ghost" color={t.danger} onPress={remove} />
    </Screen>
  );
}
