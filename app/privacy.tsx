import * as Location from 'expo-location';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Button } from '../src/components/Button';
import { Card, Muted } from '../src/components/Card';
import { Field, parseNumber } from '../src/components/Field';
import { ListRow } from '../src/components/ListRow';
import { Screen } from '../src/components/Screen';
import { PRIVACY_RADIUS_MAX_M, PRIVACY_RADIUS_MIN_M, clampPrivacyRadius } from '../src/features/share/privacy';
import { useSettingsStore } from '../src/store/settingsStore';
import { useTheme } from '../src/theme/theme';
import { newId } from '../src/utils/id';

export default function PrivacyScreen(): React.JSX.Element {
  const t = useTheme();
  const zones = useSettingsStore((s) => s.settings.privacyZones);
  const update = useSettingsStore((s) => s.update);
  const [name, setName] = useState('집');
  const [radius, setRadius] = useState('300');
  const [busy, setBusy] = useState(false);

  /** 현재 위치를 프라이버시 존 중심으로 등록(한 번만 위치를 읽음) */
  const addHere = async (): Promise<void> => {
    setBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error('위치 권한이 필요합니다.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await update({
        privacyZones: [...zones, { id: newId(), name: name.trim() || '프라이버시 존', latitude: pos.coords.latitude, longitude: pos.coords.longitude, radiusM: clampPrivacyRadius(parseNumber(radius) ?? 300) }],
      });
    } catch (e) {
      Alert.alert('추가 실패', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Muted>
        공유 이미지를 만들 때 프라이버시 존(반경 {PRIVACY_RADIUS_MIN_M}~{PRIVACY_RADIUS_MAX_M}m) 안에서 시작하거나 끝나는 경로를 숨겨 집·회사 위치가 드러나지 않게 해요. 앱 안의 기록에는 그대로 남아요.
      </Muted>
      <Card title="등록된 존">
        {zones.length === 0 ? <Muted>등록된 프라이버시 존이 없어요.</Muted> : null}
        {zones.map((z) => (
          <ListRow key={z.id} title={z.name} subtitle={`반경 ${z.radiusM}m`} right={<Button title="삭제" variant="ghost" color={t.danger} onPress={() => void update({ privacyZones: zones.filter((x) => x.id !== z.id) })} />} />
        ))}
      </Card>
      <Card title="현재 위치로 추가">
        <Field label="이름" value={name} onChangeText={setName} />
        <Field label={`반경 (m, ${PRIVACY_RADIUS_MIN_M}~${PRIVACY_RADIUS_MAX_M})`} value={radius} onChangeText={setRadius} keyboardType="number-pad" />
        <Button title="📍 지금 있는 곳을 추가" loading={busy} onPress={() => void addHere()} />
      </Card>
    </Screen>
  );
}
