import { Stack, router } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button } from '../src/components/Button';
import { initDatabase } from '../src/db/database';
import { ACTIVITY_CONFIGS } from '../src/features/activity/activityConfig';
// locationSource를 불러오면 백그라운드 위치 태스크가 전역 스코프에서 정의된다(앱이 백그라운드에서 깨어날 때 필요).
import { stopStrayLocationUpdates } from '../src/features/tracking/locationSource';
import { checkRecovery, discardDraft, finishSession, resumeRecovered } from '../src/features/tracking/trackingService';
import { configureNotifications } from '../src/features/workouts/planReminders';
import { useSettingsStore } from '../src/store/settingsStore';
import { useTheme } from '../src/theme/theme';
import { formatDistance, formatDateTime } from '../src/utils/format';

configureNotifications();
// 기본은 세로 화면. 자전거 기록 화면만 거치대 사용을 위해 가로 회전을 허용한다(app/tracking.tsx).
void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);

/** 강제 종료 후 다시 실행하면 진행 중이던 기록을 이어서 할지 묻는다. */
async function promptRecovery(): Promise<void> {
  const info = await checkRecovery();
  if (!info) {
    await stopStrayLocationUpdates();
    return;
  }
  const unit = useSettingsStore.getState().settings.unit;
  const label = `${ACTIVITY_CONFIGS[info.type].icon} ${ACTIVITY_CONFIGS[info.type].label} · ${formatDateTime(info.startedAt)} · ${formatDistance(info.distanceM, unit)}`;
  if (info.finished) {
    Alert.alert('저장하지 않은 기록', `${label}\n요약 화면에서 저장할까요?`, [
      { text: '버리기', style: 'destructive', onPress: () => void discardDraft() },
      { text: '요약 보기', onPress: () => void resumeRecovered().then(() => router.push('/summary')) },
    ]);
    return;
  }
  Alert.alert('기록이 중단되었어요', `${label}\n앱이 종료되기 전까지의 기록이 남아 있습니다. 이어서 기록할까요?`, [
    { text: '버리기', style: 'destructive', onPress: () => void discardDraft() },
    {
      text: '종료하고 저장',
      onPress: () =>
        void resumeRecovered()
          .then(() => finishSession())
          .then(() => router.push('/summary')),
    },
    { text: '이어서 기록', onPress: () => void resumeRecovered().then(() => router.push('/tracking')) },
  ]);
}

function SafetyNotice(): React.JSX.Element | null {
  const t = useTheme();
  const acknowledged = useSettingsStore((s) => s.settings.safetyNoticeAcknowledged);
  const update = useSettingsStore((s) => s.update);
  if (acknowledged) return null;
  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: t.card }]}>
          <Text style={styles.emoji}>👀</Text>
          <Text style={[styles.title, { color: t.text }]}>주변을 살피며 운동하세요</Text>
          <Text style={{ color: t.subtext, fontSize: 15, lineHeight: 22 }}>
            {'• 이어폰 볼륨은 주변 소리가 들릴 정도로\n• 횡단보도와 교차로에서는 화면을 보지 마세요\n• 자전거 주행 중에는 휴대폰을 조작하지 마세요\n• 모든 기록은 이 기기에만 저장됩니다. 정기적으로 백업하세요'}
          </Text>
          <Button title="확인했어요" big onPress={() => void update({ safetyNoticeAcknowledged: true })} />
        </View>
      </View>
    </Modal>
  );
}

export default function RootLayout(): React.JSX.Element {
  const t = useTheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const repos = await initDatabase();
        await useSettingsStore.getState().load(repos.settings);
        setReady(true);
        await promptRecovery();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        {error ? <Text style={{ color: t.danger }}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.card },
          headerTintColor: t.text,
          contentStyle: { backgroundColor: t.bg },
          headerBackTitle: '뒤로',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="tracking" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="summary" options={{ title: '활동 요약', gestureEnabled: false, headerBackVisible: false }} />
        <Stack.Screen name="activity/[id]" options={{ title: '활동 상세' }} />
        <Stack.Screen name="activity/segment-create" options={{ title: '내 구간 만들기' }} />
        <Stack.Screen name="stats" options={{ title: '통계' }} />
        <Stack.Screen name="records" options={{ title: '개인 기록' }} />
        <Stack.Screen name="badges" options={{ title: '배지' }} />
        <Stack.Screen name="goals" options={{ title: '목표' }} />
        <Stack.Screen name="plans" options={{ title: '훈련 플랜' }} />
        <Stack.Screen name="plan/[id]" options={{ title: '훈련 플랜' }} />
        <Stack.Screen name="gear/index" options={{ title: '장비' }} />
        <Stack.Screen name="gear/[id]" options={{ title: '장비 상세' }} />
        <Stack.Screen name="segments" options={{ title: '내 구간' }} />
        <Stack.Screen name="segment/[id]" options={{ title: '구간 기록' }} />
        <Stack.Screen name="sensors" options={{ title: '센서 연결' }} />
        <Stack.Screen name="settings" options={{ title: '설정' }} />
        <Stack.Screen name="contacts" options={{ title: '긴급 연락처' }} />
        <Stack.Screen name="privacy" options={{ title: '프라이버시 존' }} />
        <Stack.Screen name="backup" options={{ title: '백업 및 복원' }} />
      </Stack>
      <SafetyNotice />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 20, padding: 24, gap: 16 },
  emoji: { fontSize: 44, textAlign: 'center' },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
});
