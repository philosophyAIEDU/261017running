import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { Button } from '../src/components/Button';
import { Card, Muted } from '../src/components/Card';
import { NumberSettingField } from '../src/components/Field';
import { ListRow } from '../src/components/ListRow';
import { Screen } from '../src/components/Screen';
import { scanSensors, type ScannedSensor } from '../src/features/sensors/bleSensors';
import { useSettingsStore } from '../src/store/settingsStore';
import { useTheme } from '../src/theme/theme';

const KIND_LABEL = { heartRate: '💓 심박 벨트', cyclingSpeedCadence: '🚲 속도·케이던스' } as const;

export default function SensorsScreen(): React.JSX.Element {
  const t = useTheme();
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState<ScannedSensor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const toggleScan = async (): Promise<void> => {
    if (scanning) {
      stopRef.current?.();
      setScanning(false);
      return;
    }
    setFound([]);
    setError(null);
    setScanning(true);
    stopRef.current = await scanSensors(
      (s) => setFound((prev) => (prev.some((p) => p.id === s.id) ? prev : [...prev, s])),
      (msg) => {
        setError(msg);
        setScanning(false);
      },
    );
    setTimeout(() => {
      stopRef.current?.();
      setScanning(false);
    }, 15000);
  };

  const pair = (s: ScannedSensor): void => {
    if (settings.pairedSensors.some((p) => p.id === s.id)) return;
    void update({ pairedSensors: [...settings.pairedSensors, { id: s.id, name: s.name, kind: s.kind }] });
  };

  return (
    <Screen>
      <Card title="등록된 센서">
        {settings.pairedSensors.length === 0 ? <Muted>등록된 센서가 없어요. 기록을 시작하면 등록된 센서에 자동으로 연결돼요.</Muted> : null}
        {settings.pairedSensors.map((s) => (
          <ListRow
            key={s.id}
            title={s.name}
            subtitle={KIND_LABEL[s.kind]}
            right={<Button title="해제" variant="ghost" color={t.danger} onPress={() => void update({ pairedSensors: settings.pairedSensors.filter((p) => p.id !== s.id) })} />}
          />
        ))}
      </Card>
      <Card title="센서 찾기">
        <Muted>심박 벨트(Heart Rate 0x180D)와 자전거 속도·케이던스 센서(CSC 0x1816)를 찾습니다. 센서를 깨운 뒤(착용하거나 바퀴를 돌려) 검색하세요.</Muted>
        <Button title={scanning ? '검색 중지' : '검색 시작'} onPress={() => void toggleScan()} loading={false} />
        {error ? <Text style={{ color: t.danger }}>{error}</Text> : null}
        {found.map((s) => (
          <ListRow key={s.id} title={s.name} subtitle={KIND_LABEL[s.kind]} right={<Button title={settings.pairedSensors.some((p) => p.id === s.id) ? '등록됨' : '등록'} variant="secondary" onPress={() => pair(s)} />} />
        ))}
      </Card>
      <Card title="자전거 센서 설정">
        <NumberSettingField label="바퀴 둘레 (mm) · 700x25c ≈ 2105" value={settings.wheelCircumferenceMm} onCommit={(n) => void update({ wheelCircumferenceMm: Math.round(n) })} />
        <Muted>속도 센서가 연결되면 GPS 대신 센서 속도를 우선 사용하고, 케이던스(rpm)를 표시해요.</Muted>
      </Card>
      <Card title="심박 구간">
        <NumberSettingField label="최대 심박 (비우면 220-나이)" value={settings.maxHeartRate ?? 0} onCommit={(n) => void update({ maxHeartRate: Math.round(n) })} />
        <Muted>Zone 1~5는 최대 심박의 50/60/70/80/90% 기준이에요. 설정 &gt; 출생 연도를 입력하면 자동 추정돼요.</Muted>
      </Card>
    </Screen>
  );
}
