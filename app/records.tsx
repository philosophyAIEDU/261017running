import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { Card, Muted } from '../src/components/Card';
import { ListRow } from '../src/components/ListRow';
import { ModeSelector } from '../src/components/ModeSelector';
import { Screen } from '../src/components/Screen';
import { ACTIVITY_CONFIGS } from '../src/features/activity/activityConfig';
import { computePersonalRecords } from '../src/features/analysis/personalRecords';
import { predictRaceTimes } from '../src/features/analysis/racePredictor';
import { useActivitySummaries } from '../src/hooks/useActivities';
import { useSettingsStore } from '../src/store/settingsStore';
import { useTheme } from '../src/theme/theme';
import { formatDate, formatDistance, formatDuration, formatPace, formatSpeed } from '../src/utils/format';
import type { ActivityType, PersonalRecord } from '../src/types';

function valueText(r: PersonalRecord, unit: 'km' | 'mi'): string {
  switch (r.unit) {
    case 'sec':
      return formatDuration(r.value);
    case 'm':
      return r.key === 'maxElevationGain' ? `${Math.round(r.value)} m` : formatDistance(r.value, unit);
    case 'mps':
      return formatSpeed(r.value, unit);
    case 'steps':
      return `${Math.round(r.value).toLocaleString('ko-KR')}보`;
  }
}

export default function RecordsScreen(): React.JSX.Element {
  const t = useTheme();
  const unit = useSettingsStore((s) => s.settings.unit);
  const last = useSettingsStore((s) => s.settings.lastActivityType);
  const [type, setType] = useState<ActivityType>(last);
  const { data } = useActivitySummaries();
  const list = data ?? [];
  const records = computePersonalRecords(list, type);
  const predictions = type === 'run' ? predictRaceTimes(list) : [];
  return (
    <Screen>
      <ModeSelector value={type} onChange={(v) => v && setType(v)} compact />
      <Card title={`${ACTIVITY_CONFIGS[type].icon} ${ACTIVITY_CONFIGS[type].label} 최고 기록`}>
        {records.length === 0 ? <Muted>아직 기록이 없어요.</Muted> : null}
        {records.map((r) => (
          <ListRow
            key={r.key}
            title={`${r.label}  ${valueText(r, unit)}`}
            subtitle={formatDate(r.achievedAt)}
            onPress={r.activityId ? () => router.push({ pathname: '/activity/[id]', params: { id: r.activityId ?? '' } }) : undefined}
          />
        ))}
        {type === 'run' ? <Muted>1K~풀코스 기록은 활동 전체에서 가장 빠른 구간을 찾아 계산해요.</Muted> : null}
        {type === 'ride' ? <Muted>최고 속도는 GPS 노이즈를 걸러낸 뒤 5초 평균으로 계산해요.</Muted> : null}
      </Card>
      {type === 'run' ? (
        <Card title="레이스 기록 예측">
          {predictions.length === 0 ? <Muted>최근 120일 안에 3km 이상 달린 기록이 있으면 예측할 수 있어요.</Muted> : null}
          {predictions.map((p) => (
            <Text key={p.key} style={{ color: t.text, fontSize: 16, paddingVertical: 4 }}>
              {p.label}: <Text style={{ fontWeight: '800' }}>{formatDuration(p.predictedSec)}</Text> ({formatPace(p.distanceM / p.predictedSec, unit)})
            </Text>
          ))}
          {predictions.length > 0 ? <Muted>Riegel 공식 T2 = T1 × (D2/D1)^1.06, 목표 거리와 가장 가까운 최근 기록 기준</Muted> : null}
        </Card>
      ) : null}
    </Screen>
  );
}
