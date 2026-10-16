import { router } from 'expo-router';
import { Alert, Text } from 'react-native';
import { Card, Muted, SectionTitle } from '../src/components/Card';
import { NumberSettingField } from '../src/components/Field';
import { ListRow, SwitchRow } from '../src/components/ListRow';
import { Screen } from '../src/components/Screen';
import { Segmented } from '../src/components/Segmented';
import { getRepositories } from '../src/db/database';
import { ACTIVITY_CONFIGS, ACTIVITY_TYPES } from '../src/features/activity/activityConfig';
import { requestHealthPermission } from '../src/features/health/healthSync';
import { estimateMaxHeartRate } from '../src/features/sensors/heartRateZones';
import { setVoiceEnabled } from '../src/features/tracking/voiceCoach';
import { useAsync } from '../src/hooks/useAsync';
import { useDataVersion } from '../src/store/dataStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { useTheme } from '../src/theme/theme';
import { formatBytes } from '../src/utils/format';
import type { DistanceUnit, ThemePreference } from '../src/types';

export default function SettingsScreen(): React.JSX.Element {
  const t = useTheme();
  const s = useSettingsStore((x) => x.settings);
  const update = useSettingsStore((x) => x.update);
  const version = useDataVersion();
  const size = useAsync(() => getRepositories().storageBytes(), [version]);
  const gear = useAsync(() => getRepositories().gear.list(), [version]);

  const toggleHealth = async (v: boolean): Promise<void> => {
    if (!v) {
      await update({ healthSyncEnabled: false });
      return;
    }
    const ok = await requestHealthPermission();
    if (!ok) {
      Alert.alert('헬스 연동을 켤 수 없어요', 'iOS 건강 앱 / Android Health Connect 권한을 허용했는지 확인하세요. (Development Build에서만 동작)');
      return;
    }
    await update({ healthSyncEnabled: true });
  };

  return (
    <Screen>
      <SectionTitle>단위 및 화면</SectionTitle>
      <Card>
        <Segmented<DistanceUnit>
          options={[
            { value: 'km', label: '킬로미터 (km)' },
            { value: 'mi', label: '마일 (mi)' },
          ]}
          value={s.unit}
          onChange={(v) => void update({ unit: v })}
        />
        <Segmented<ThemePreference>
          options={[
            { value: 'system', label: '시스템' },
            { value: 'light', label: '라이트' },
            { value: 'dark', label: '다크' },
          ]}
          value={s.theme}
          onChange={(v) => void update({ theme: v })}
        />
        <SwitchRow title="고대비 색상" subtitle="햇빛 아래에서 더 잘 보이게" value={s.highContrast} onValueChange={(v) => void update({ highContrast: v })} />
      </Card>

      <SectionTitle>신체 정보 (칼로리·심박 구간·보폭)</SectionTitle>
      <Card>
        <NumberSettingField label="체중 (kg) · 미입력 시 65kg로 계산" value={s.weightKg ?? 65} onCommit={(n) => void update({ weightKg: n })} />
        <NumberSettingField label="키 (cm) · 실내 걷기 보폭 추정" value={s.heightCm ?? 170} onCommit={(n) => void update({ heightCm: n })} />
        <NumberSettingField label="출생 연도 · 최대 심박 220-나이 추정" value={s.birthYear ?? 1990} onCommit={(n) => void update({ birthYear: Math.round(n) })} />
        <Muted>추정 최대 심박: {s.maxHeartRate ?? estimateMaxHeartRate(s.birthYear) ?? '-'} bpm (센서 연결 화면에서 직접 입력 가능)</Muted>
      </Card>

      <SectionTitle>기록</SectionTitle>
      <Card>
        <SwitchRow
          title="음성 안내"
          subtitle="구간 안내와 시작·일시정지·종료 알림 (음악 볼륨을 잠시 줄임)"
          value={s.voiceEnabled}
          onValueChange={(v) => {
            setVoiceEnabled(v);
            void update({ voiceEnabled: v });
          }}
        />
        {ACTIVITY_TYPES.map((type) => {
          const c = ACTIVITY_CONFIGS[type];
          return (
            <SwitchRow
              key={type}
              title={`${c.icon} ${c.label} 자동 일시정지`}
              subtitle={`${c.autoPause.speedBelowMps}m/s 미만 ${c.autoPause.durationSec}초`}
              value={s.autoPauseEnabled[type]}
              onValueChange={(v) => void update({ autoPauseEnabled: { ...s.autoPauseEnabled, [type]: v } })}
            />
          );
        })}
        {ACTIVITY_TYPES.map((type) => {
          const options = (gear.data ?? []).filter((g) => !g.retired && g.activityTypes.includes(type));
          if (options.length === 0) return null;
          const current = options.find((g) => g.id === s.defaultGearIds[type]);
          return (
            <ListRow
              key={`gear-${type}`}
              title={`${ACTIVITY_CONFIGS[type].label} 기본 장비`}
              subtitle={current?.name ?? '지정 안 함 (장비 상세에서 지정)'}
              onPress={() => router.push(current ? { pathname: '/gear/[id]', params: { id: current.id } } : '/gear')}
            />
          );
        })}
      </Card>

      <SectionTitle>안전 및 개인정보</SectionTitle>
      <Card>
        <ListRow icon="🆘" title="긴급 연락처" subtitle={`${s.emergencyContacts.length}명 등록 · SOS 문자`} onPress={() => router.push('/contacts')} />
        <ListRow icon="🏠" title="프라이버시 존" subtitle={`${s.privacyZones.length}곳 · 공유 이미지에서 출발·도착 경로 숨김`} onPress={() => router.push('/privacy')} />
        <SwitchRow title="헬스 앱 연동" subtitle="완료한 운동을 건강 앱/Health Connect에 저장" value={s.healthSyncEnabled} onValueChange={(v) => void toggleHealth(v)} />
        <SwitchRow title="자전거 시작 전 안전 안내" subtitle="주행 중 휴대폰 조작 금지 안내 표시" value={!s.rideSafetyNoticeAcknowledged} onValueChange={(v) => void update({ rideSafetyNoticeAcknowledged: !v })} />
      </Card>

      <SectionTitle>데이터</SectionTitle>
      <Card>
        <ListRow icon="💾" title="백업 및 복원" subtitle={`앱 데이터 ${size.data !== null ? formatBytes(size.data) : '…'}`} onPress={() => router.push('/backup')} />
        <Muted>이 앱은 회원가입·서버·광고·분석 SDK가 없어요. 지도 타일을 불러올 때 외에는 네트워크를 사용하지 않으며, 인터넷 없이도 기록·조회·분석이 모두 동작해요.</Muted>
      </Card>

      {__DEV__ ? (
        <>
          <SectionTitle>개발자</SectionTitle>
          <Card>
            <SwitchRow title="GPS 시뮬레이션" subtitle="샘플 GPX(노이즈 포함)를 재생해 실제로 움직이지 않고 테스트" value={s.simulationEnabled} onValueChange={(v) => void update({ simulationEnabled: v })} />
            <Segmented
              options={[
                { value: '1', label: '1배속' },
                { value: '5', label: '5배속' },
                { value: '20', label: '20배속' },
              ]}
              value={String(s.simulationSpeed)}
              onChange={(v) => void update({ simulationSpeed: Number(v) })}
            />
            <ListRow title="첫 실행 안전 안내 다시 보기" onPress={() => void update({ safetyNoticeAcknowledged: false })} />
          </Card>
        </>
      ) : null}
      <Text style={{ color: t.subtext, textAlign: 'center', fontSize: 12 }}>달리기·산책·자전거 v1.0.0</Text>
    </Screen>
  );
}
