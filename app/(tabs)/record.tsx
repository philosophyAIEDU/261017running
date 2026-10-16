import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Card, Muted } from '../../src/components/Card';
import { Field, parseNumber } from '../../src/components/Field';
import { ModeSelector } from '../../src/components/ModeSelector';
import { Screen } from '../../src/components/Screen';
import { Segmented } from '../../src/components/Segmented';
import { ACTIVITY_CONFIGS } from '../../src/features/activity/activityConfig';
import {
  getLocationPermissionState,
  hasMotionPermission,
  requestBackgroundLocation,
  requestForegroundLocation,
  requestMotionPermission,
} from '../../src/features/tracking/permissions';
import { startSession } from '../../src/features/tracking/trackingService';
import { totalIntervalSec } from '../../src/features/workouts/interval';
import { getPlan, allWorkouts } from '../../src/features/workouts/trainingPlans';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useTheme } from '../../src/theme/theme';
import { formatDuration, paceSecToSpeed, unitLabel, unitToMeters } from '../../src/utils/format';
import type { ActivityType, IntervalSettings, WorkoutKind, WorkoutSettings } from '../../src/types';

type Explainer = null | { kind: 'background' | 'motion'; resolve: (go: boolean) => void };

/** "5:30" → 330초 */
function parsePace(text: string): number | null {
  const m = /^(\d{1,2})[:'](\d{1,2})$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

interface FormInit {
  type: ActivityType;
  kind: WorkoutKind;
  targetDistance: string;
  targetMinutes: string;
  iform: { warmup: string; work: string; recover: string; repeats: string; cooldown: string };
  planWorkoutId: string | null;
  planTitle: string | null;
}

/** 훈련 플랜에서 "시작"을 누르고 들어온 경우 해당 훈련으로 폼 초기값을 채운다. */
function initialForm(lastType: ActivityType, planId?: string, workoutId?: string): FormInit {
  const base: FormInit = {
    type: lastType,
    kind: 'free',
    targetDistance: '',
    targetMinutes: '',
    iform: { warmup: '10', work: '3', recover: '2', repeats: '5', cooldown: '10' },
    planWorkoutId: null,
    planTitle: null,
  };
  const plan = planId ? getPlan(planId) : undefined;
  const wo = plan && workoutId ? allWorkouts(plan).find((w) => w.id === workoutId) : undefined;
  if (!wo) return base;
  const w = wo.workout;
  const init: FormInit = { ...base, type: wo.activityType, planWorkoutId: wo.id, planTitle: wo.title };
  if (w?.kind === 'interval' && w.interval) {
    return {
      ...init,
      kind: 'interval',
      iform: {
        warmup: String(w.interval.warmupSec / 60),
        work: String(w.interval.workSec / 60),
        recover: String(w.interval.recoverSec / 60),
        repeats: String(w.interval.repeats),
        cooldown: String(w.interval.cooldownSec / 60),
      },
    };
  }
  if (w?.kind === 'target' && w.target) {
    return { ...init, kind: 'target', targetDistance: w.target.distanceM ? String(w.target.distanceM / 1000) : '', targetMinutes: w.target.durationSec ? String(w.target.durationSec / 60) : '' };
  }
  return init;
}

export default function RecordScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ planId?: string; workoutId?: string }>();
  // 탭 화면은 계속 마운트되어 있으므로, 다른 플랜 훈련으로 들어오면 key를 바꿔 폼을 새로 만든다.
  return <RecordForm key={`${params.planId ?? ''}/${params.workoutId ?? ''}`} planId={params.planId} workoutId={params.workoutId} />;
}

function RecordForm({ planId, workoutId }: { planId?: string; workoutId?: string }): React.JSX.Element {
  const t = useTheme();
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const [init] = useState(() => initialForm(settings.lastActivityType, planId, workoutId));
  const [type, setType] = useState<ActivityType>(init.type);
  const [kind, setKind] = useState<WorkoutKind>(init.kind);
  const [targetDistance, setTargetDistance] = useState(init.targetDistance);
  const [targetMinutes, setTargetMinutes] = useState(init.targetMinutes);
  const [targetPace, setTargetPace] = useState('');
  const [iform, setIform] = useState(init.iform);
  const planWorkoutId = init.planWorkoutId;
  const planTitle = init.planTitle;
  const [explainer, setExplainer] = useState<Explainer>(null);
  const [rideNotice, setRideNotice] = useState<null | (() => void)>(null);
  const config = ACTIVITY_CONFIGS[type];
  const color = t.mode(type);

  const kinds: { value: WorkoutKind; label: string }[] = [
    { value: 'free', label: '자유' },
    { value: 'target', label: '목표' },
    ...(config.supportsIntervals ? [{ value: 'interval' as const, label: '인터벌' }] : []),
    { value: 'indoor', label: '실내' },
  ];
  const effectiveKind: WorkoutKind = kind === 'interval' && !config.supportsIntervals ? 'free' : kind;

  const intervalSettings = (): IntervalSettings | null => {
    const n = (s: string): number => Math.max(0, parseNumber(s) ?? 0);
    const s: IntervalSettings = {
      warmupSec: n(iform.warmup) * 60,
      workSec: n(iform.work) * 60,
      recoverSec: n(iform.recover) * 60,
      repeats: Math.round(n(iform.repeats)),
      cooldownSec: n(iform.cooldown) * 60,
    };
    return s.workSec > 0 && s.repeats > 0 ? s : null;
  };

  const buildWorkout = (): WorkoutSettings | null => {
    if (effectiveKind === 'target') {
      const km = parseNumber(targetDistance);
      const min = parseNumber(targetMinutes);
      let speed: number | null = null;
      if (targetPace.trim() !== '') {
        if (config.primaryMetric === 'pace') {
          const sec = parsePace(targetPace);
          if (sec === null) {
            Alert.alert('목표 페이스 형식', '분:초 형식으로 입력하세요. 예) 5:30');
            return null;
          }
          speed = paceSecToSpeed(sec, settings.unit);
        } else {
          const v = parseNumber(targetPace);
          speed = v ? unitToMeters(v, settings.unit) / 3600 : null;
        }
      }
      if (!km && !min && !speed) {
        Alert.alert('목표를 입력하세요', '거리, 시간, 페이스(속도) 중 하나 이상을 입력하세요.');
        return null;
      }
      return { kind: 'target', target: { distanceM: km ? unitToMeters(km, settings.unit) : null, durationSec: min ? min * 60 : null, speedMps: speed }, interval: null, planWorkoutId };
    }
    if (effectiveKind === 'interval') {
      const s = intervalSettings();
      if (!s) {
        Alert.alert('인터벌 설정', '고강도 시간과 반복 횟수를 입력하세요.');
        return null;
      }
      return { kind: 'interval', target: null, interval: s, planWorkoutId };
    }
    return { kind: effectiveKind, target: null, interval: null, planWorkoutId };
  };

  const askExplainer = (k: 'background' | 'motion'): Promise<boolean> => new Promise((resolve) => setExplainer({ kind: k, resolve }));

  /**
   * 권한 흐름: 앱 사용 중 위치 → (이유 설명) 백그라운드 위치 → (이유 설명) 동작/걸음.
   * 위치를 거부하면 실내 모드로 안내한다.
   */
  const ensurePermissions = async (indoor: boolean): Promise<'ok' | 'indoor' | 'cancel'> => {
    if (!indoor && !settings.simulationEnabled) {
      let state = await getLocationPermissionState();
      if (state === 'denied') {
        const ok = await requestForegroundLocation();
        state = ok ? await getLocationPermissionState() : 'denied';
      }
      if (state === 'denied') {
        return new Promise((resolve) =>
          Alert.alert('위치 권한이 필요해요', '위치 권한 없이도 실내 모드로 시간과 거리(직접 입력)를 기록할 수 있어요.', [
            { text: '취소', style: 'cancel', onPress: () => resolve('cancel') },
            { text: '실내 모드로 시작', onPress: () => resolve('indoor') },
          ]),
        );
      }
      if (state === 'foregroundOnly' && (await askExplainer('background'))) {
        await requestBackgroundLocation();
      }
    }
    if (config.usesPedometer && !(await hasMotionPermission()) && (await askExplainer('motion'))) {
      await requestMotionPermission();
    }
    return indoor ? 'indoor' : 'ok';
  };

  const start = async (): Promise<void> => {
    const workout = buildWorkout();
    if (!workout) return;
    const go = async (): Promise<void> => {
      const result = await ensurePermissions(workout.kind === 'indoor');
      if (result === 'cancel') return;
      const finalWorkout: WorkoutSettings = result === 'indoor' ? { ...workout, kind: workout.kind === 'free' || workout.kind === 'indoor' ? 'indoor' : workout.kind } : workout;
      startSession({ type, workout: finalWorkout, isIndoor: result === 'indoor' });
      router.push('/tracking');
    };
    // 자전거: 시작 전에 주행 중 휴대폰 조작 금지 안내
    if (type === 'ride' && !settings.rideSafetyNoticeAcknowledged) {
      setRideNotice(() => () => void go());
      return;
    }
    await go();
  };

  const selectType = (v: ActivityType | null): void => {
    if (!v) return;
    setType(v);
    void update({ lastActivityType: v });
  };

  const iv = intervalSettings();

  return (
    <Screen>
      <ModeSelector value={type} onChange={selectType} />
      <Segmented options={kinds} value={effectiveKind} onChange={setKind} color={color} />
      {planTitle ? (
        <Card accent={color}>
          <Muted>훈련 플랜</Muted>
          <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{planTitle}</Text>
        </Card>
      ) : null}

      {effectiveKind === 'free' ? (
        <Card>
          <Text style={{ color: t.text, fontSize: 16 }}>
            {config.icon} {config.label}: {config.primaryMetric === 'pace' ? '페이스' : '속도'} 중심으로 기록하고 {config.announceEveryKm}
            {unitLabel(settings.unit)}마다 음성으로 안내해요.
          </Text>
          <Muted>자동 일시정지 {settings.autoPauseEnabled[type] ? '켜짐' : '꺼짐'} · 설정에서 변경</Muted>
        </Card>
      ) : null}

      {effectiveKind === 'target' ? (
        <Card title="목표 설정">
          <Field label={`목표 거리 (${unitLabel(settings.unit)})`} value={targetDistance} onChangeText={setTargetDistance} keyboardType="decimal-pad" placeholder="예) 5" />
          <Field label="목표 시간 (분)" value={targetMinutes} onChangeText={setTargetMinutes} keyboardType="number-pad" placeholder="예) 30" />
          <Field
            label={config.primaryMetric === 'pace' ? `목표 페이스 (분:초/${unitLabel(settings.unit)})` : `목표 속도 (${settings.unit === 'km' ? 'km/h' : 'mph'})`}
            value={targetPace}
            onChangeText={setTargetPace}
            keyboardType={config.primaryMetric === 'pace' ? 'numbers-and-punctuation' : 'decimal-pad'}
            placeholder={config.primaryMetric === 'pace' ? '예) 5:30' : '예) 25'}
          />
          <Muted>목표에서 5% 이상 벗어난 상태가 20초 이어지면 음성으로 알려드려요.</Muted>
        </Card>
      ) : null}

      {effectiveKind === 'interval' ? (
        <Card title="인터벌 설정 (분)">
          <View style={styles.row}>
            <View style={styles.flex}>
              <Field label="워밍업" value={iform.warmup} onChangeText={(v) => setIform({ ...iform, warmup: v })} keyboardType="decimal-pad" />
            </View>
            <View style={styles.flex}>
              <Field label="쿨다운" value={iform.cooldown} onChangeText={(v) => setIform({ ...iform, cooldown: v })} keyboardType="decimal-pad" />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Field label="고강도" value={iform.work} onChangeText={(v) => setIform({ ...iform, work: v })} keyboardType="decimal-pad" />
            </View>
            <View style={styles.flex}>
              <Field label="회복" value={iform.recover} onChangeText={(v) => setIform({ ...iform, recover: v })} keyboardType="decimal-pad" />
            </View>
            <View style={styles.flex}>
              <Field label="반복" value={iform.repeats} onChangeText={(v) => setIform({ ...iform, repeats: v })} keyboardType="number-pad" />
            </View>
          </View>
          <Muted>{iv ? `총 ${formatDuration(totalIntervalSec(iv))} · 구간이 바뀔 때 음성과 진동으로 알려드려요.` : '고강도 시간과 반복 횟수를 입력하세요.'}</Muted>
        </Card>
      ) : null}

      {effectiveKind === 'indoor' ? (
        <Card title={`${config.indoorLabel} 모드`}>
          <Muted>
            GPS 없이 시간을 기록하고, 종료 후 거리를 직접 입력해요.
            {type === 'walk' ? ' 산책은 걸음 수로 거리를 추정해 미리 채워 드려요.' : ''}
          </Muted>
        </Card>
      ) : null}

      {settings.simulationEnabled && effectiveKind !== 'indoor' ? (
        <Card accent={t.warning}>
          <Text style={{ color: t.warning, fontWeight: '700' }}>GPS 시뮬레이션 모드 ({settings.simulationSpeed}배속)</Text>
          <Muted>샘플 GPX 경로를 재생합니다. 설정에서 끌 수 있어요.</Muted>
        </Card>
      ) : null}

      <Button testID="start-button" title={`${config.icon} ${config.label} 시작`} big color={color} onPress={() => void start()} style={styles.start} />

      <Modal transparent visible={explainer !== null} animationType="fade">
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: t.card }]}>
            <Text style={[styles.sheetTitle, { color: t.text }]}>{explainer?.kind === 'background' ? '📍 화면이 꺼져도 기록하려면' : '👟 걸음 수를 세려면'}</Text>
            <Text style={{ color: t.subtext, fontSize: 15, lineHeight: 22 }}>
              {explainer?.kind === 'background'
                ? '주머니에 넣거나 다른 앱(음악 등)을 쓰는 동안에도 경로가 끊기지 않도록 "항상 허용" 위치 권한이 필요해요. 활동 중이 아닐 때는 위치를 전혀 수집하지 않고, 기록은 이 기기에만 저장돼요.'
                : '걸음 수와 케이던스를 측정하려면 동작 및 피트니스 권한이 필요해요. 걸음 데이터는 이 기기에만 저장돼요.'}
            </Text>
            <Button
              title="허용하기"
              big
              color={color}
              onPress={() => {
                explainer?.resolve(true);
                setExplainer(null);
              }}
            />
            <Button
              title="나중에"
              variant="ghost"
              onPress={() => {
                explainer?.resolve(false);
                setExplainer(null);
              }}
            />
          </View>
        </View>
      </Modal>

      <Modal transparent visible={rideNotice !== null} animationType="fade">
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: t.card }]}>
            <Text style={[styles.sheetTitle, { color: t.text }]}>🚴 주행 중에는 휴대폰을 조작하지 마세요</Text>
            <Text style={{ color: t.subtext, fontSize: 15, lineHeight: 22 }}>
              거리, 시간, 속도는 모두 음성으로 안내해 드려요. 화면을 확인해야 할 때는 안전한 곳에 멈춘 뒤 확인하세요. 거치대를 사용하면 가로 화면으로 볼 수 있어요.
            </Text>
            <Button
              testID="ride-notice-ok"
              title="확인하고 시작"
              big
              color={color}
              onPress={() => {
                const go = rideNotice;
                setRideNotice(null);
                go?.();
              }}
            />
            <Button
              title="다시 보지 않기"
              variant="ghost"
              onPress={() => {
                const go = rideNotice;
                setRideNotice(null);
                void update({ rideSafetyNoticeAcknowledged: true });
                go?.();
              }}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  start: { marginTop: 8 },
  backdrop: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 20, padding: 24, gap: 14 },
  sheetTitle: { fontSize: 20, fontWeight: '800' },
});
