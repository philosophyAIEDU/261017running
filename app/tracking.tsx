import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigStat } from '../src/components/BigStat';
import { Button } from '../src/components/Button';
import { LongPressButton } from '../src/components/LongPressButton';
import { RouteMap } from '../src/components/RouteMap';
import { ACTIVITY_CONFIGS } from '../src/features/activity/activityConfig';
import { openSosComposer } from '../src/features/safety/sos';
import { liveMetricDisplay, visibleLiveMetrics } from '../src/features/tracking/liveMetrics';
import { cancelCountdown, finishSession, getCurrentLocation, pauseSession, resumeSession, speakCurrentStatus } from '../src/features/tracking/trackingService';
import { PHASE_LABELS } from '../src/features/workouts/interval';
import { useSettingsStore } from '../src/store/settingsStore';
import { useTrackingStore } from '../src/store/trackingStore';
import { MIN_TOUCH, useTheme } from '../src/theme/theme';
import { formatDuration } from '../src/utils/format';

function KeepAwake(): null {
  useKeepAwake();
  return null;
}

export default function TrackingScreen(): React.JSX.Element {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const phase = useTrackingStore((s) => s.phase);
  const countdown = useTrackingStore((s) => s.countdown);
  const type = useTrackingStore((s) => s.type);
  const status = useTrackingStore((s) => s.status);
  const snapshot = useTrackingStore((s) => s.snapshot);
  const path = useTrackingStore((s) => s.path);
  const isIndoor = useTrackingStore((s) => s.isIndoor);
  const intervalStatus = useTrackingStore((s) => s.intervalStatus);
  const gpsWeak = useTrackingStore((s) => s.gpsWeak);
  const sensorsConnected = useTrackingStore((s) => s.sensorsConnected);
  const unit = useSettingsStore((s) => s.settings.unit);
  const contacts = useSettingsStore((s) => s.settings.emergencyContacts);
  const config = ACTIVITY_CONFIGS[type];
  const color = t.mode(type);
  const landscape = width > height;

  // 자전거는 거치대 사용을 고려해 가로 화면을 허용하고, 나머지 모드는 세로로 고정한다.
  useEffect(() => {
    if (config.supportsLandscape) void ScreenOrientation.unlockAsync().catch(() => undefined);
    else void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    };
  }, [config.supportsLandscape]);

  useEffect(() => {
    if (phase === 'idle') router.back();
  }, [phase]);

  // Android 뒤로 가기로 기록 화면이 닫히지 않게 막는다(종료는 길게 누르기로만).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const onStop = async (): Promise<void> => {
    await finishSession();
    router.replace('/summary');
  };

  const onSos = async (): Promise<void> => {
    const result = await openSosComposer(contacts, getCurrentLocation(), config.label);
    if (result === 'noContacts') Alert.alert('긴급 연락처가 없어요', '설정 > 긴급 연락처에서 최대 3명을 등록할 수 있어요.');
    if (result === 'unavailable') Alert.alert('문자를 보낼 수 없어요', '이 기기에서는 문자 앱을 사용할 수 없습니다.');
  };

  if (phase === 'countdown') {
    return (
      <View style={[styles.countdown, { backgroundColor: color }]} testID="countdown">
        <Text style={styles.countdownLabel}>
          {config.icon} {config.label}
        </Text>
        <Text style={styles.countdownNumber} accessibilityLiveRegion="assertive">
          {countdown}
        </Text>
        <Button title="취소" variant="secondary" onPress={cancelCountdown} />
      </View>
    );
  }

  const metrics = snapshot ? visibleLiveMetrics(config.liveMetrics, snapshot, isIndoor).map((m) => liveMetricDisplay(m, snapshot, unit)) : [];
  const [hero, ...rest] = metrics;
  const paused = status === 'paused' || status === 'autoPaused';

  const statsBlock = (
    <View style={styles.stats}>
      {intervalStatus ? (
        <View style={[styles.banner, { backgroundColor: intervalStatus.phase.kind === 'work' ? color : t.card, borderColor: color }]} testID="interval-banner">
          <Text style={[styles.bannerText, { color: intervalStatus.phase.kind === 'work' ? '#FFFFFF' : t.text }]}>
            {PHASE_LABELS[intervalStatus.phase.kind]}
            {intervalStatus.phase.repeat > 0 ? ` ${intervalStatus.phase.repeat}` : ''} · 남은 시간 {formatDuration(intervalStatus.remainingSec)}
          </Text>
        </View>
      ) : null}
      {hero ? <BigStat label={hero.label} value={hero.value} unit={hero.unit} size="hero" color={color} testID={`metric-${hero.key}`} /> : null}
      <View style={styles.grid}>
        {rest.map((m) => (
          <View key={m.key} style={styles.cell}>
            <BigStat label={m.label} value={m.value} unit={m.unit} size="large" testID={`metric-${m.key}`} />
          </View>
        ))}
      </View>
    </View>
  );

  const controls = (
    <View style={styles.controls}>
      {paused ? (
        <>
          <Button testID="resume-button" title="▶ 재개" big color={color} onPress={resumeSession} style={styles.flex} />
          <LongPressButton testID="stop-button" title="■ 종료" color={t.danger} onComplete={() => void onStop()} style={styles.flex} />
        </>
      ) : (
        <Button testID="pause-button" title="❚❚ 일시정지" big color={color} onPress={pauseSession} style={styles.flex} />
      )}
      <LongPressButton testID="sos-button" title="SOS" hint="길게" color={t.danger} onComplete={() => void onSos()} style={styles.sos} />
    </View>
  );

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={['top', 'bottom', 'left', 'right']}>
      {config.supportsLandscape ? <KeepAwake /> : null}
      <View style={styles.header}>
        <Text style={[styles.mode, { color }]}>
          {config.icon} {isIndoor ? config.indoorLabel : config.label}
        </Text>
        <Text style={{ color: status === 'autoPaused' ? t.warning : paused ? t.danger : t.subtext, fontWeight: '700' }} testID="status-label">
          {status === 'autoPaused' ? '자동 일시정지' : status === 'paused' ? '일시정지' : status === 'running' ? '기록 중' : ''}
          {gpsWeak ? ' · GPS 약함' : ''}
          {sensorsConnected > 0 ? ` · 센서 ${sensorsConnected}` : ''}
        </Text>
      </View>
      {landscape ? (
        <View style={[styles.flex, styles.landscape]}>
          <View style={styles.flex}>{statsBlock}</View>
          {!isIndoor ? <RouteMap path={path} follow current={snapshot?.lastLocation ?? null} color={color} style={styles.landscapeMap} /> : null}
        </View>
      ) : (
        <View style={styles.flex}>
          {!isIndoor ? <RouteMap path={path} follow current={snapshot?.lastLocation ?? null} color={color} style={{ height: config.voiceOnlyWhileMoving ? 160 : 200 }} /> : null}
          {statsBlock}
        </View>
      )}
      {config.voiceOnlyWhileMoving ? (
        <Pressable accessibilityRole="button" onPress={speakCurrentStatus} style={[styles.voice, { borderColor: t.border }]}>
          <Text style={{ color: t.text, fontWeight: '700' }}>🔊 현재 상태 음성으로 듣기</Text>
        </Pressable>
      ) : null}
      {controls}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  countdown: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  countdownLabel: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  countdownNumber: { color: '#FFFFFF', fontSize: 160, fontWeight: '900' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  mode: { fontSize: 20, fontWeight: '800' },
  stats: { padding: 12, gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%' },
  banner: { borderRadius: 12, padding: 10, borderWidth: 2 },
  bannerText: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  controls: { flexDirection: 'row', gap: 10, padding: 12, alignItems: 'stretch' },
  sos: { width: MIN_TOUCH + 16 },
  voice: { marginHorizontal: 12, borderWidth: 1, borderRadius: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  landscape: { flexDirection: 'row' },
  landscapeMap: { flex: 1, height: undefined, margin: 8 },
});
