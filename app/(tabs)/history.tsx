import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { ModeSelector } from '../../src/components/ModeSelector';
import { getRepositories } from '../../src/db/database';
import { ACTIVITY_CONFIGS } from '../../src/features/activity/activityConfig';
import { saveActivity } from '../../src/features/activity/activityService';
import { pickTextFile } from '../../src/features/backup/backupIO';
import { gpxToActivity, previewGpx } from '../../src/features/backup/gpxImport';
import { resolveMaxHeartRate } from '../../src/features/sensors/heartRateZones';
import { useActivitySummaries } from '../../src/hooks/useActivities';
import { bumpData } from '../../src/store/dataStore';
import { getSettings, useSettingsStore } from '../../src/store/settingsStore';
import { useTheme } from '../../src/theme/theme';
import { formatDateTime, formatDistance, formatDuration, formatPrimary } from '../../src/utils/format';
import { newId } from '../../src/utils/id';
import type { ActivitySummary, ActivityType } from '../../src/types';
import { eventTime } from '../../src/utils/date';

/** 평균 속도로 모드를 추정해 제안한 뒤, 사용자가 고른 모드로 GPX를 가져온다. */
async function importGpx(): Promise<void> {
  const file = await pickTextFile(['application/gpx+xml', 'application/xml', 'text/xml', '*/*']);
  if (!file) return;
  let preview: ReturnType<typeof previewGpx>;
  try {
    preview = previewGpx(file.text);
  } catch (e) {
    Alert.alert('가져오기 실패', e instanceof Error ? e.message : String(e));
    return;
  }
  const doImport = async (type: ActivityType): Promise<void> => {
    try {
      const s = getSettings();
      const { activity, points } = gpxToActivity(file.text, type, newId(), s.weightKg, resolveMaxHeartRate(s.maxHeartRate, s.birthYear), eventTime());
      await saveActivity(getRepositories(), activity, points);
      bumpData();
      router.push({ pathname: '/activity/[id]', params: { id: activity.id } });
    } catch (e) {
      Alert.alert('가져오기 실패', e instanceof Error ? e.message : String(e));
    }
  };
  const suggested = preview.suggestedType ?? preview.typeHint;
  const speedKmh = (preview.avgSpeedMps * 3.6).toFixed(1);
  const others = (Object.keys(ACTIVITY_CONFIGS) as ActivityType[]).filter((t) => t !== suggested);
  Alert.alert(
    'GPX 가져오기',
    `${preview.name ?? file.name}\n평균 ${speedKmh}km/h${suggested ? ` → ${ACTIVITY_CONFIGS[suggested].label} 기록으로 보여요.` : ''}\n어떤 모드로 가져올까요?`,
    [
      ...(suggested ? [{ text: `${ACTIVITY_CONFIGS[suggested].icon} ${ACTIVITY_CONFIGS[suggested].label} (추천)`, onPress: () => void doImport(suggested) }] : []),
      ...others.map((t) => ({ text: `${ACTIVITY_CONFIGS[t].icon} ${ACTIVITY_CONFIGS[t].label}`, onPress: () => void doImport(t) })),
      { text: '취소', style: 'cancel' as const },
    ],
  );
}

function ActivityRow({ a, onPress }: { a: ActivitySummary; onPress: () => void }): React.JSX.Element {
  const t = useTheme();
  const unit = useSettingsStore((s) => s.settings.unit);
  const c = ACTIVITY_CONFIGS[a.type];
  return (
    <Pressable accessibilityRole="button" onPress={onPress} testID={`activity-${a.id}`} style={({ pressed }) => [styles.row, { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.badge, { backgroundColor: t.mode(a.type) }]}>
        <Text style={styles.badgeIcon}>{c.icon}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }} numberOfLines={1}>
          {a.title}
        </Text>
        <Text style={{ color: t.subtext, fontSize: 12 }}>{formatDateTime(a.startedAt)}</Text>
        <Text style={{ color: t.text, marginTop: 4 }}>
          {formatDistance(a.distanceM, unit)} · {formatDuration(a.durationSec)} · {formatPrimary(a.avgSpeedMps, c.primaryMetric, unit)}
          {a.steps !== null && a.type === 'walk' ? ` · ${a.steps.toLocaleString('ko-KR')}보` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

export default function HistoryScreen(): React.JSX.Element {
  const t = useTheme();
  const [filter, setFilter] = useState<ActivityType | null>(null);
  const { data, loading, reload } = useActivitySummaries();
  const list = (data ?? []).filter((a) => filter === null || a.type === filter);
  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.flex, { backgroundColor: t.bg }]}>
      <View style={styles.top}>
        <ModeSelector value={filter} onChange={setFilter} allowAll compact />
      </View>
      <FlatList
        testID="history-list"
        data={list}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => <ActivityRow a={item} onPress={() => router.push({ pathname: '/activity/[id]', params: { id: item.id } })} />}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={reload}
        ListEmptyComponent={
          loading ? undefined : (
            <Text style={{ color: t.subtext, textAlign: 'center', marginTop: 40 }} testID="history-empty">
              {filter ? `${ACTIVITY_CONFIGS[filter].label} 기록이 없어요.` : '아직 기록이 없어요. 기록하기 탭에서 시작해 보세요!'}
            </Text>
          )
        }
        ListFooterComponent={<Button title="GPX 파일 가져오기" variant="secondary" onPress={() => void importGpx()} style={{ marginTop: 12 }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { padding: 12 },
  list: { paddingHorizontal: 12, paddingBottom: 40, gap: 8 },
  row: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  badge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badgeIcon: { fontSize: 22 },
});
