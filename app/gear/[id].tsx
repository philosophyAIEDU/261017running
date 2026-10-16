import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { Card, Muted } from '../../src/components/Card';
import { Field, NumberSettingField, parseNumber } from '../../src/components/Field';
import { SwitchRow } from '../../src/components/ListRow';
import { ProgressBar } from '../../src/components/ProgressRing';
import { Screen } from '../../src/components/Screen';
import { getRepositories } from '../../src/db/database';
import { ACTIVITY_CONFIGS } from '../../src/features/activity/activityConfig';
import { componentDistance, gearDistance, wearLevel } from '../../src/features/gear/gear';
import { useActivitySummaries } from '../../src/hooks/useActivities';
import { useAsync } from '../../src/hooks/useAsync';
import { bumpData, useDataVersion } from '../../src/store/dataStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useTheme } from '../../src/theme/theme';
import { eventTime } from '../../src/utils/date';
import { formatDistance, metersToUnit, unitLabel, unitToMeters } from '../../src/utils/format';
import { newId } from '../../src/utils/id';
import type { GearComponent } from '../../src/types';

export default function GearDetailScreen(): React.JSX.Element {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const unit = settings.unit;
  const version = useDataVersion();
  const repos = getRepositories();
  const { data } = useAsync(async () => ({ gear: await repos.gear.get(id), components: await repos.gear.listComponents(id) }), [id, version]);
  const activities = useActivitySummaries();
  const [newComp, setNewComp] = useState({ name: '', km: '' });
  const g = data?.gear;
  if (!g) return <Screen><Muted>불러오는 중…</Muted></Screen>;
  const total = gearDistance(g, activities.data ?? []);
  const count = (activities.data ?? []).filter((a) => a.gearId === g.id).length;

  const saveGear = async (patch: Partial<typeof g>): Promise<void> => {
    await repos.gear.save({ ...g, ...patch, updatedAt: eventTime() });
    bumpData();
  };

  const saveComponent = async (c: GearComponent, patch: Partial<GearComponent>): Promise<void> => {
    await repos.gear.saveComponent({ ...c, ...patch, updatedAt: eventTime() });
    bumpData();
  };

  const addComponent = async (): Promise<void> => {
    const km = parseNumber(newComp.km);
    if (!newComp.name.trim() || !km) return;
    const now = eventTime();
    await repos.gear.saveComponent({ id: newId(), gearId: g.id, name: newComp.name.trim(), installedAtGearDistanceM: total, replaceAfterM: unitToMeters(km, unit), createdAt: now, updatedAt: now });
    setNewComp({ name: '', km: '' });
    bumpData();
  };

  const remove = (): void =>
    Alert.alert('장비를 삭제할까요?', '이 장비로 기록한 활동은 남고 장비 연결만 해제돼요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void repos.gear.delete(g.id).then(() => { bumpData(); router.back(); }) },
    ]);

  return (
    <Screen>
      <Text style={{ color: t.text, fontSize: 22, fontWeight: '800' }}>
        {g.kind === 'shoe' ? '👟' : '🚲'} {g.name}
      </Text>
      <Muted>
        누적 {formatDistance(total, unit)} · 활동 {count}회{g.brand ? ` · ${g.brand}` : ''}
      </Muted>
      {g.kind === 'shoe' ? (
        <Card title="교체 기준">
          <ProgressBar progress={total / g.retireAtM} color={total >= g.retireAtM ? t.danger : t.success} />
          <NumberSettingField label={`교체 알림 거리 (${unitLabel(unit)}, 권장 600~800km)`} value={Math.round(metersToUnit(g.retireAtM, unit))} onCommit={(n) => void saveGear({ retireAtM: unitToMeters(n, unit) })} />
        </Card>
      ) : (
        <Card title="부품">
          {(data?.components ?? []).map((c) => {
            const used = componentDistance(c, total);
            const lvl = wearLevel(used, c.replaceAfterM);
            return (
              <View key={c.id} style={styles.comp}>
                <View style={styles.row}>
                  <Text style={{ color: t.text, fontWeight: '700', flex: 1 }}>{c.name}</Text>
                  <Text style={{ color: lvl === 'replace' ? t.danger : lvl === 'warning' ? t.warning : t.subtext }}>
                    {formatDistance(used, unit, 0)} / {formatDistance(c.replaceAfterM, unit, 0)}
                  </Text>
                </View>
                <ProgressBar progress={used / c.replaceAfterM} color={lvl === 'replace' ? t.danger : lvl === 'warning' ? t.warning : t.success} />
                <NumberSettingField label={`교체 기준 (${unitLabel(unit)})`} value={Math.round(metersToUnit(c.replaceAfterM, unit))} onCommit={(n) => void saveComponent(c, { replaceAfterM: unitToMeters(n, unit) })} />
                <View style={styles.row}>
                  <Button
                    title="교체했어요"
                    variant="secondary"
                    onPress={() => Alert.alert(`${c.name} 교체`, '지금부터 다시 거리를 셀까요?', [{ text: '취소', style: 'cancel' }, { text: '교체', onPress: () => void saveComponent(c, { installedAtGearDistanceM: total }) }])}
                  />
                  <Button title="삭제" variant="ghost" color={t.danger} onPress={() => void repos.gear.deleteComponent(c.id).then(bumpData)} />
                </View>
              </View>
            );
          })}
          <Field label="부품 이름" value={newComp.name} onChangeText={(v) => setNewComp({ ...newComp, name: v })} placeholder="예) 체인" />
          <Field label={`교체 기준 (${unitLabel(unit)})`} value={newComp.km} onChangeText={(v) => setNewComp({ ...newComp, km: v })} keyboardType="number-pad" placeholder="3000" />
          <Button title="부품 추가" variant="secondary" onPress={() => void addComponent()} />
        </Card>
      )}
      <Card title="기본 장비">
        {g.activityTypes.map((type) => (
          <SwitchRow
            key={type}
            title={`${ACTIVITY_CONFIGS[type].icon} ${ACTIVITY_CONFIGS[type].label} 기본 장비`}
            subtitle="새 기록에 자동으로 연결"
            value={settings.defaultGearIds[type] === g.id}
            onValueChange={(v) => void updateSettings({ defaultGearIds: { ...settings.defaultGearIds, [type]: v ? g.id : undefined } })}
          />
        ))}
        <SwitchRow title="은퇴" subtitle="목록 아래로 내리고 알림을 끕니다" value={g.retired} onValueChange={(v) => void saveGear({ retired: v })} />
      </Card>
      <Button title="장비 삭제" variant="ghost" color={t.danger} onPress={remove} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  comp: { gap: 6, paddingVertical: 6 },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
});
