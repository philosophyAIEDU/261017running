import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { ActivityStats, SplitTable } from '../../src/components/ActivityStats';
import { Button } from '../../src/components/Button';
import { Card, Muted } from '../../src/components/Card';
import { EffortPicker } from '../../src/components/EffortPicker';
import { Field } from '../../src/components/Field';
import { MetricChart } from '../../src/components/MetricChart';
import { ModeSelector } from '../../src/components/ModeSelector';
import { ProgressBar } from '../../src/components/ProgressRing';
import { RouteMap } from '../../src/components/RouteMap';
import { Screen } from '../../src/components/Screen';
import { ShareCard } from '../../src/components/ShareCard';
import { getRepositories } from '../../src/db/database';
import { ACTIVITY_CONFIGS } from '../../src/features/activity/activityConfig';
import { changeSavedActivityType } from '../../src/features/activity/activityService';
import { suggestModeChange, modeChangeQuestion } from '../../src/features/activity/modeDetection';
import { shareFile, writeCacheFile } from '../../src/features/backup/backupIO';
import { toGpx } from '../../src/features/backup/gpx';
import { BEST_EFFORT_DISTANCES } from '../../src/features/analysis/personalRecords';
import { cadenceSeries, colorizeRoute, elevationSeries, heartRateSeries, speedSeries, stepsPerBucket } from '../../src/features/analysis/series';
import { HR_ZONE_LABELS, resolveMaxHeartRate } from '../../src/features/sensors/heartRateZones';
import { hidePrivateEnds } from '../../src/features/share/privacy';
import { shareViewAsImage } from '../../src/features/share/shareImage';
import { saveActivityToHealth } from '../../src/features/health/healthSync';
import { useAsync } from '../../src/hooks/useAsync';
import { bumpData, useDataVersion } from '../../src/store/dataStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useTheme } from '../../src/theme/theme';
import { eventTime } from '../../src/utils/date';
import { buildTimeline } from '../../src/utils/geo';
import { formatDateTime, formatDuration, formatPaceValue, formatSpeedValue, speedToUnitPerHour, unitLabel } from '../../src/utils/format';
import type { Activity, ActivityType, TrackPoint } from '../../src/types';

interface Loaded {
  activity: Activity;
  points: TrackPoint[];
}

export default function ActivityDetailScreen(): React.JSX.Element {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const settings = useSettingsStore((s) => s.settings);
  const unit = settings.unit;
  const version = useDataVersion();
  const shareRef = useRef<ComponentRef<typeof View>>(null);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [form, setForm] = useState({ title: '', note: '', effort: null as number | null });
  const repos = getRepositories();
  const { data, reload } = useAsync<Loaded | null>(async () => {
    const activity = await repos.activities.get(id);
    if (!activity) return null;
    // GPS 포인트는 상세 화면에서만 읽는다(목록은 요약 테이블만).
    return { activity, points: await repos.activities.getTrackPoints(id) };
  }, [id, version]);
  const efforts = useAsync(async () => {
    const list = await repos.segments.listEffortsForActivity(id);
    const segs = await repos.segments.list();
    return list.map((e) => ({ effort: e, name: segs.find((s) => s.id === e.segmentId)?.name ?? '구간' }));
  }, [id, version]);
  const gear = useAsync(() => repos.gear.list(), [version]);

  const analysis = useMemo(() => {
    if (!data) return null;
    const { activity: a, points } = data;
    const tl = buildTimeline(points, a.details.pauses, a.startedAt);
    return {
      colored: colorizeRoute(points, a.details.pauses),
      path: points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
      speed: speedSeries(tl),
      elevation: elevationSeries(points, tl),
      hr: heartRateSeries(points, tl),
      cadence: a.type === 'run' ? cadenceSeries(a.details.stepSamples, a.startedAt, a.details.pauses) : [],
      steps: a.type === 'walk' ? stepsPerBucket(a.details.stepSamples, a.startedAt, a.details.pauses, 5) : [],
      sharePath: hidePrivateEnds(points, settings.privacyZones).map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
    };
  }, [data, settings.privacyZones]);

  if (!data || !analysis) {
    return (
      <Screen>
        <Muted>불러오는 중…</Muted>
      </Screen>
    );
  }
  const a = data.activity;
  const c = ACTIVITY_CONFIGS[a.type];
  const color = t.mode(a.type);
  const suggestion = !a.isIndoor ? suggestModeChange(a.type, a.avgSpeedMps, a.distanceM, a.durationSec) : null;
  const gearName = gear.data?.find((g) => g.id === a.gearId)?.name;

  const changeType = (type: ActivityType | null): void => {
    if (!type || type === a.type) return;
    Alert.alert(`${ACTIVITY_CONFIGS[type].label}(으)로 변경`, '스플릿, 칼로리, 개인 기록, 구간 순위가 새 모드 기준으로 다시 계산됩니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '변경',
        onPress: () =>
          void changeSavedActivityType(repos, a, type, settings.weightKg, resolveMaxHeartRate(settings.maxHeartRate, settings.birthYear)).then(() => {
            bumpData();
            reload();
          }),
      },
    ]);
  };

  const startEdit = (): void => {
    setForm({ title: a.title, note: a.note, effort: a.perceivedEffort });
    setEditing(true);
  };

  const saveEdit = async (): Promise<void> => {
    await repos.activities.update({ ...a, title: form.title.trim() || a.title, note: form.note, perceivedEffort: form.effort, updatedAt: eventTime() });
    setEditing(false);
    bumpData();
  };

  const setGear = async (gearId: string | null): Promise<void> => {
    await repos.activities.update({ ...a, gearId, updatedAt: eventTime() });
    bumpData();
  };

  const remove = (): void => {
    Alert.alert('기록을 삭제할까요?', '삭제한 기록은 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () =>
          void repos.activities.delete(a.id).then(() => {
            bumpData();
            router.back();
          }),
      },
    ]);
  };

  const exportGpx = async (): Promise<void> => {
    try {
      const file = await writeCacheFile(`${a.title.replace(/[\\/:*?"<>|]/g, '_')}.gpx`, toGpx(a.title, a.type, data.points));
      await shareFile(file, 'application/gpx+xml', 'GPX 내보내기');
    } catch (e) {
      Alert.alert('내보내기 실패', e instanceof Error ? e.message : String(e));
    }
  };

  const syncHealth = async (): Promise<void> => {
    const ok = await saveActivityToHealth(a);
    if (ok) {
      await repos.activities.update({ ...a, details: { ...a.details, healthSynced: true } });
      bumpData();
    }
    Alert.alert(ok ? '헬스 앱에 저장했어요' : '헬스 앱에 저장하지 못했어요', ok ? '' : '설정에서 헬스 연동 권한을 확인하세요.');
  };

  const speedFmt = (y: number): string => (c.primaryMetric === 'pace' ? formatPaceValue(y, unit) : formatSpeedValue(y, unit));
  const distFmt = (x: number): string => (x / (unit === 'km' ? 1000 : 1609.344)).toFixed(1);
  const zones = a.details.hrZonesSec;
  const zoneTotal = zones ? zones.reduce((s, z) => s + z, 0) : 0;
  const prKeys = c.distancePrKeys.filter((k) => a.details.bestEfforts[k] !== undefined);
  const splitSpeeds = a.details.splits.map((s) => s.avgSpeedMps);

  return (
    <Screen>
      <Text style={[styles.title, { color: t.text }]}>
        {c.icon} {a.title}
      </Text>
      <Muted>
        {formatDateTime(a.startedAt)}
        {a.isIndoor ? ` · ${c.indoorLabel}` : ''}
        {a.details.source === 'gpx' ? ' · GPX 가져옴' : a.details.source === 'simulation' ? ' · 시뮬레이션' : ''}
        {gearName ? ` · ${gearName}` : ''}
      </Muted>
      {a.note ? <Text style={{ color: t.text }}>{a.note}</Text> : null}
      {a.perceivedEffort ? <Muted>체감 강도 {a.perceivedEffort}/10</Muted> : null}

      {!a.isIndoor ? <RouteMap path={analysis.path} coloredPaths={analysis.colored} color={color} style={{ height: 260 }} /> : null}
      {suggestion ? (
        <Card accent={t.mode(suggestion)}>
          <Text style={{ color: t.text, fontWeight: '700' }}>{modeChangeQuestion(suggestion)}</Text>
          <Button title={`${ACTIVITY_CONFIGS[suggestion].label}(으)로 변경`} color={t.mode(suggestion)} onPress={() => changeType(suggestion)} />
        </Card>
      ) : null}
      <Card>
        <ActivityStats activity={a} unit={unit} />
      </Card>

      {analysis.speed.length > 1 ? (
        <Card>
          <MetricChart
            title={c.primaryMetric === 'pace' ? `페이스 (/${unitLabel(unit)})` : `속도 (${unit === 'km' ? 'km/h' : 'mph'})`}
            data={c.primaryMetric === 'pace' ? analysis.speed : analysis.speed.map((p) => ({ x: p.x, y: speedToUnitPerHour(p.y, unit) }))}
            color={color}
            invert={c.primaryMetric === 'pace'}
            formatY={c.primaryMetric === 'pace' ? speedFmt : (y) => y.toFixed(0)}
            formatX={distFmt}
          />
        </Card>
      ) : null}
      {analysis.elevation.length > 1 ? (
        <Card>
          <MetricChart title="고도 (m)" data={analysis.elevation} color="#8E6C4A" formatX={distFmt} summary={`상승 ${a.elevationGainM}m · 하강 ${a.details.elevationLossM}m`} />
        </Card>
      ) : null}
      {analysis.hr.length > 1 ? (
        <Card>
          <MetricChart title="심박 (bpm)" data={analysis.hr} color="#D92D20" formatX={(x) => formatDuration(x)} summary={`평균 ${a.details.avgHeartRate ?? '-'} · 최고 ${a.details.maxHeartRate ?? '-'}`} />
        </Card>
      ) : null}
      {zones && zoneTotal > 0 ? (
        <Card title="심박 구간">
          {zones.map((z, i) => (
            <View key={i} style={styles.zone}>
              <Text style={{ color: t.text, width: 110 }}>
                Z{i + 1} {HR_ZONE_LABELS[i]}
              </Text>
              <View style={styles.flex}>
                <ProgressBar progress={z / zoneTotal} color={['#98A2B3', '#53B1FD', '#12B76A', '#F79009', '#F04438'][i]} />
              </View>
              <Text style={{ color: t.subtext, width: 56, textAlign: 'right' }}>{formatDuration(z)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
      {analysis.cadence.length > 1 ? (
        <Card>
          <MetricChart title="케이던스 (spm)" data={analysis.cadence} color={color} formatX={(x) => `${x}분`} summary={a.details.avgCadence ? `평균 ${a.details.avgCadence} spm` : undefined} />
        </Card>
      ) : null}
      {analysis.steps.length > 0 ? (
        <Card>
          <MetricChart title="시간대별 걸음 수 (5분)" type="bar" data={analysis.steps} color={color} formatX={(x) => `${x}분`} summary={a.steps !== null ? `총 ${a.steps.toLocaleString('ko-KR')}보` : undefined} />
        </Card>
      ) : null}

      {a.details.splits.length > 0 ? (
        <Card title={`구간 비교 (${c.splitEveryKm}km)`}>
          <SplitTable splits={a.details.splits} type={a.type} unit={unit} />
          {splitSpeeds.length > 1 ? (
            <Muted>
              가장 빠른 구간 {splitSpeeds.indexOf(Math.max(...splitSpeeds)) + 1} · 가장 느린 구간 {splitSpeeds.indexOf(Math.min(...splitSpeeds)) + 1}
            </Muted>
          ) : null}
        </Card>
      ) : null}
      {prKeys.length > 0 ? (
        <Card title="이번 활동 최고 구간">
          {prKeys.map((k) => (
            <Text key={k} style={{ color: t.text }}>
              {BEST_EFFORT_DISTANCES[k].label}: {formatDuration(a.details.bestEfforts[k] ?? 0)}
            </Text>
          ))}
        </Card>
      ) : null}
      {efforts.data && efforts.data.length > 0 ? (
        <Card title="내 구간 기록">
          {efforts.data.map(({ effort, name }) => (
            <Text key={effort.id} style={{ color: t.text }} onPress={() => router.push({ pathname: '/segment/[id]', params: { id: effort.segmentId } })}>
              📍 {name}: {formatDuration(effort.elapsedSec)} ›
            </Text>
          ))}
        </Card>
      ) : null}

      {editing ? (
        <Card title="기록 수정">
          <Field label="이름" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} />
          <Field label="메모" value={form.note} onChangeText={(v) => setForm({ ...form, note: v })} multiline />
          <EffortPicker value={form.effort} onChange={(v) => setForm({ ...form, effort: v })} color={color} />
          <View style={styles.row}>
            <Button title="취소" variant="secondary" onPress={() => setEditing(false)} style={styles.flex} />
            <Button title="저장" color={color} onPress={() => void saveEdit()} style={styles.flex} />
          </View>
        </Card>
      ) : (
        <Card title="관리">
          <Text style={{ color: t.subtext, fontSize: 13 }}>모드 변경</Text>
          <ModeSelector value={a.type} onChange={changeType} compact />
          {(gear.data ?? []).filter((g) => !g.retired && g.activityTypes.includes(a.type)).length > 0 ? (
            <>
              <Text style={{ color: t.subtext, fontSize: 13 }}>장비</Text>
              <View style={styles.wrap}>
                {(gear.data ?? [])
                  .filter((g) => !g.retired && g.activityTypes.includes(a.type))
                  .map((g) => (
                    <Button key={g.id} title={g.name} variant={a.gearId === g.id ? 'primary' : 'secondary'} color={color} onPress={() => void setGear(a.gearId === g.id ? null : g.id)} />
                  ))}
              </View>
            </>
          ) : null}
          <Button title="✏️ 이름·메모·체감 강도 수정" variant="secondary" onPress={startEdit} />
          {!a.isIndoor && data.points.length > 1 ? (
            <>
              <Button title="🖼️ 공유 이미지 만들기" variant="secondary" onPress={() => setSharing(true)} />
              <Button title="📍 이 경로로 내 구간 만들기" variant="secondary" onPress={() => router.push({ pathname: '/activity/segment-create', params: { id: a.id } })} />
              <Button title="📤 GPX 내보내기" variant="secondary" onPress={() => void exportGpx()} />
            </>
          ) : null}
          {settings.healthSyncEnabled && !a.details.healthSynced ? <Button title="❤️ 헬스 앱에 저장" variant="secondary" onPress={() => void syncHealth()} /> : null}
          <Button title="삭제" variant="ghost" color={t.danger} onPress={remove} />
        </Card>
      )}

      <Modal visible={sharing} animationType="slide" onRequestClose={() => setSharing(false)}>
        <View style={[styles.modal, { backgroundColor: t.bg }]}>
          <ShareCard ref={shareRef} activity={a} path={analysis.sharePath} unit={unit} />
          <Muted>
            {settings.privacyZones.length > 0 ? `프라이버시 존 ${settings.privacyZones.length}곳 근처의 출발·도착 경로는 숨겨집니다.` : '설정 > 프라이버시 존에서 집 근처 경로를 숨길 수 있어요.'}
          </Muted>
          <Button
            title="공유하기"
            big
            color={color}
            onPress={() =>
              void shareViewAsImage(shareRef).catch((e: unknown) => Alert.alert('공유 실패', e instanceof Error ? e.message : String(e)))
            }
          />
          <Button title="닫기" variant="ghost" onPress={() => setSharing(false)} />
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flex: { flex: 1 },
  zone: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modal: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
});
