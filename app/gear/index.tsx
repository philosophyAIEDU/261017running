import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Button } from '../../src/components/Button';
import { Card, Muted } from '../../src/components/Card';
import { Field, parseNumber } from '../../src/components/Field';
import { ListRow } from '../../src/components/ListRow';
import { ProgressBar } from '../../src/components/ProgressRing';
import { Screen } from '../../src/components/Screen';
import { Segmented } from '../../src/components/Segmented';
import { getRepositories } from '../../src/db/database';
import { DEFAULT_BIKE_COMPONENTS, SHOE_RETIRE_DEFAULT_M, gearDistance, shoeWearLevel } from '../../src/features/gear/gear';
import { useActivitySummaries } from '../../src/hooks/useActivities';
import { useAsync } from '../../src/hooks/useAsync';
import { bumpData, useDataVersion } from '../../src/store/dataStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useTheme } from '../../src/theme/theme';
import { formatDistance, unitLabel, unitToMeters } from '../../src/utils/format';
import { newId } from '../../src/utils/id';
import type { GearKind } from '../../src/types';
import { eventTime } from '../../src/utils/date';

export default function GearListScreen(): React.JSX.Element {
  const t = useTheme();
  const unit = useSettingsStore((s) => s.settings.unit);
  const version = useDataVersion();
  const gear = useAsync(() => getRepositories().gear.list(), [version]);
  const { data } = useActivitySummaries();
  const [kind, setKind] = useState<GearKind>('shoe');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [initial, setInitial] = useState('');

  const add = async (): Promise<void> => {
    if (!name.trim()) {
      Alert.alert('이름을 입력하세요');
      return;
    }
    const now = eventTime();
    const id = newId();
    const repos = getRepositories();
    await repos.gear.save({
      id,
      kind,
      name: name.trim(),
      brand: brand.trim(),
      activityTypes: kind === 'shoe' ? ['run', 'walk'] : ['ride'],
      initialDistanceM: unitToMeters(parseNumber(initial) ?? 0, unit),
      retireAtM: kind === 'shoe' ? SHOE_RETIRE_DEFAULT_M : 0,
      retired: false,
      createdAt: now,
      updatedAt: now,
    });
    if (kind === 'bike') {
      for (const c of DEFAULT_BIKE_COMPONENTS) {
        await repos.gear.saveComponent({ id: newId(), gearId: id, name: c.name, installedAtGearDistanceM: 0, replaceAfterM: c.replaceAfterM, createdAt: now, updatedAt: now });
      }
    }
    setName('');
    setBrand('');
    setInitial('');
    bumpData();
  };

  return (
    <Screen>
      {(gear.data ?? []).map((g) => {
        const total = gearDistance(g, data ?? []);
        const level = g.kind === 'shoe' ? shoeWearLevel(total, g.retireAtM) : 'ok';
        return (
          <Card key={g.id} onPress={() => router.push({ pathname: '/gear/[id]', params: { id: g.id } })} accent={g.retired ? t.border : level === 'replace' ? t.danger : level === 'warning' ? t.warning : undefined}>
            <Text style={{ color: t.text, fontWeight: '800', fontSize: 17 }}>
              {g.kind === 'shoe' ? '👟' : '🚲'} {g.name} {g.retired ? '(은퇴)' : ''}
            </Text>
            <Muted>
              {g.brand ? `${g.brand} · ` : ''}
              {formatDistance(total, unit, 0)}
              {g.kind === 'shoe' ? ` / 교체 기준 ${formatDistance(g.retireAtM, unit, 0)}` : ''}
            </Muted>
            {g.kind === 'shoe' ? <ProgressBar progress={total / g.retireAtM} color={level === 'ok' ? t.success : level === 'warning' ? t.warning : t.danger} /> : null}
          </Card>
        );
      })}
      <Card title="장비 추가">
        <Segmented
          options={[
            { value: 'shoe', label: '👟 신발' },
            { value: 'bike', label: '🚲 자전거' },
          ]}
          value={kind}
          onChange={setKind}
        />
        <Field label="이름" value={name} onChangeText={setName} placeholder={kind === 'shoe' ? '예) 데일리 러닝화' : '예) 로드 바이크'} />
        <Field label="브랜드/모델" value={brand} onChangeText={setBrand} />
        <Field label={`이미 사용한 거리 (${unitLabel(unit)})`} value={initial} onChangeText={setInitial} keyboardType="decimal-pad" placeholder="0" />
        {kind === 'bike' ? <Muted>체인 3000km, 타이어 5000km 등 기본 부품이 함께 등록돼요. 기준은 상세 화면에서 수정할 수 있어요.</Muted> : <Muted>600~800km에서 교체 알림을 드려요(기본 700km).</Muted>}
        <Button title="추가" onPress={() => void add()} />
      </Card>
      <ListRow title="모드별 기본 장비" subtitle="설정에서 지정하면 새 기록에 자동으로 연결돼요" onPress={() => router.push('/settings')} />
    </Screen>
  );
}
