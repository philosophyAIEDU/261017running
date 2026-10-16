import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ActivityStats, SplitTable } from '../src/components/ActivityStats';
import { Button } from '../src/components/Button';
import { Card, Muted } from '../src/components/Card';
import { EffortPicker } from '../src/components/EffortPicker';
import { Field, parseNumber } from '../src/components/Field';
import { ModeSelector } from '../src/components/ModeSelector';
import { RouteMap } from '../src/components/RouteMap';
import { Screen } from '../src/components/Screen';
import { getRepositories } from '../src/db/database';
import { ACTIVITY_CONFIGS } from '../src/features/activity/activityConfig';
import { modeChangeQuestion, suggestModeChange } from '../src/features/activity/modeDetection';
import { colorizeRoute } from '../src/features/analysis/series';
import { BEST_EFFORT_DISTANCES } from '../src/features/analysis/personalRecords';
import { gearKindFor } from '../src/features/gear/gear';
import { discardDraft, getDraft, saveDraft, updateDraft, type Draft } from '../src/features/tracking/trackingService';
import { useAsync } from '../src/hooks/useAsync';
import { useSettingsStore } from '../src/store/settingsStore';
import { useTheme } from '../src/theme/theme';
import { formatDateTime, formatDuration, formatSpeed, unitLabel, unitToMeters, metersToUnit } from '../src/utils/format';
import type { ActivityType, PersonalRecord } from '../src/types';

function recordText(r: PersonalRecord, unit: 'km' | 'mi'): string {
  if (r.unit === 'sec') return `${r.label} ${formatDuration(r.value)}`;
  if (r.unit === 'mps') return `${r.label} ${formatSpeed(r.value, unit)}`;
  if (r.unit === 'm') return `${r.label} ${(r.value / 1000).toFixed(2)}km`;
  return `${r.label} ${r.value.toLocaleString('ko-KR')}보`;
}

export default function SummaryScreen(): React.JSX.Element {
  const t = useTheme();
  const unit = useSettingsStore((s) => s.settings.unit);
  const [draft, setDraft] = useState<Draft | null>(getDraft());
  const [title, setTitle] = useState(draft?.activity.title ?? '');
  const [note, setNote] = useState('');
  const [effort, setEffort] = useState<number | null>(null);
  const [distanceText, setDistanceText] = useState(draft?.activity.isIndoor && draft.activity.distanceM > 0 ? metersToUnit(draft.activity.distanceM, unit).toFixed(2) : '');
  const [saving, setSaving] = useState(false);
  const [dismissedSuggestion, setDismissedSuggestion] = useState(false);
  const gear = useAsync(() => getRepositories().gear.list(), []);

  const a = draft?.activity ?? null;
  const colored = useMemo(() => (draft ? colorizeRoute(draft.input.points, draft.input.pauses) : []), [draft]);
  const path = useMemo(() => (draft ? draft.input.points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })) : []), [draft]);

  if (!draft || !a) {
    return (
      <Screen>
        <Muted>요약할 기록이 없습니다.</Muted>
        <Button title="홈으로" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  const color = t.mode(a.type);
  const suggestion = !a.isIndoor && !dismissedSuggestion ? suggestModeChange(a.type, a.avgSpeedMps, a.distanceM, a.durationSec) : null;
  const meta = { title, note, perceivedEffort: effort };

  const changeType = (type: ActivityType | null): void => {
    if (!type || type === a.type) return;
    const prevDefault = a.title;
    const next = updateDraft({ type, gearId: null }, meta);
    if (next) {
      setDraft(next);
      if (title === prevDefault) setTitle(next.activity.title);
    }
  };

  const setManualDistance = (text: string): void => {
    setDistanceText(text);
    const v = parseNumber(text);
    const next = updateDraft({ manualDistanceM: v !== null ? unitToMeters(v, unit) : 0 }, meta);
    if (next) setDraft(next);
  };

  const selectGear = (gearId: string | null): void => {
    const next = updateDraft({ gearId }, meta);
    if (next) setDraft(next);
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const outcome = await saveDraft(meta);
      const lines: string[] = [];
      if (outcome) {
        outcome.newRecords.forEach((r) => lines.push(`🏆 개인 기록: ${recordText(r, unit)}`));
        outcome.newBadges.forEach((b) => lines.push(`${b.icon} 배지 획득: ${b.name}`));
        outcome.segmentResults.forEach((s) => lines.push(`📍 ${s.segment.name}: ${formatDuration(s.effort.elapsedSec)} (${s.total}개 중 ${s.rank}위${s.isBest ? ', 최고 기록!' : ''})`));
      }
      router.replace({ pathname: '/activity/[id]', params: { id: a.id } });
      if (lines.length > 0) Alert.alert('축하해요! 🎉', lines.join('\n'));
    } catch (e) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = (): void => {
    Alert.alert('기록을 삭제할까요?', '삭제한 기록은 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () =>
          void discardDraft().then(() => {
            router.replace('/');
          }),
      },
    ]);
  };

  const gearOptions = (gear.data ?? []).filter((g) => !g.retired && g.kind === gearKindFor(a.type) && g.activityTypes.includes(a.type));
  const prKeys = ACTIVITY_CONFIGS[a.type].distancePrKeys.filter((k) => a.details.bestEfforts[k] !== undefined);

  return (
    <Screen>
      <Text style={[styles.date, { color: t.subtext }]}>{formatDateTime(a.startedAt)}</Text>
      <ModeSelector value={a.type} onChange={changeType} compact />
      {suggestion ? (
        <Card accent={t.mode(suggestion)}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }} testID="mode-suggestion">
            평균 {formatSpeed(a.avgSpeedMps, unit)}로 기록됐어요. {modeChangeQuestion(suggestion)}
          </Text>
          <View style={styles.row}>
            <Button title={`${ACTIVITY_CONFIGS[suggestion].label}(으)로 변경`} color={t.mode(suggestion)} onPress={() => changeType(suggestion)} style={styles.flex} />
            <Button title="그대로 두기" variant="secondary" onPress={() => setDismissedSuggestion(true)} style={styles.flex} />
          </View>
        </Card>
      ) : null}
      {!a.isIndoor ? <RouteMap path={path} coloredPaths={colored} color={color} style={{ height: 260 }} /> : null}
      {!a.isIndoor && colored.length > 0 ? <Muted>경로 색상: 빨강(느림) → 초록(빠름), {ACTIVITY_CONFIGS[a.type].primaryMetric === 'pace' ? '페이스' : '속도'} 기준</Muted> : null}
      <Card>
        <ActivityStats activity={a} unit={unit} />
      </Card>
      {a.isIndoor ? (
        <Card title="거리 입력">
          <Field label={`거리 (${unitLabel(unit)})`} value={distanceText} onChangeText={setManualDistance} keyboardType="decimal-pad" placeholder="예) 5.0" testID="indoor-distance" />
          {a.type === 'walk' ? <Muted>걸음 수로 추정한 거리를 채워 두었어요. 기기 표시값으로 고칠 수 있어요.</Muted> : <Muted>트레드밀/실내 자전거 화면의 거리를 입력하세요.</Muted>}
        </Card>
      ) : null}
      {a.details.splits.length > 0 ? (
        <Card title={`스플릿 (${ACTIVITY_CONFIGS[a.type].splitEveryKm}km)`}>
          <SplitTable splits={a.details.splits} type={a.type} unit={unit} />
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
      <Card title="기록 정보">
        <Field label="이름" value={title} onChangeText={setTitle} testID="title-input" />
        <Field label="메모" value={note} onChangeText={setNote} multiline placeholder="오늘 컨디션, 코스 메모 등" />
        <Text style={{ color: t.subtext, fontSize: 13, fontWeight: '600' }}>체감 강도</Text>
        <EffortPicker value={effort} onChange={setEffort} color={color} />
        {gearOptions.length > 0 ? (
          <>
            <Text style={{ color: t.subtext, fontSize: 13, fontWeight: '600' }}>{a.type === 'ride' ? '자전거' : '신발'}</Text>
            <View style={styles.wrap}>
              {gearOptions.map((g) => (
                <Button key={g.id} title={g.name} variant={a.gearId === g.id ? 'primary' : 'secondary'} color={color} onPress={() => selectGear(a.gearId === g.id ? null : g.id)} />
              ))}
            </View>
          </>
        ) : null}
      </Card>
      <Button testID="save-button" title="저장" big color={color} loading={saving} onPress={() => void save()} />
      <Button testID="delete-button" title="삭제" variant="ghost" color={t.danger} onPress={remove} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  date: { fontSize: 14 },
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
