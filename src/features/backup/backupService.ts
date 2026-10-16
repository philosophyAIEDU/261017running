import { createBackupFile, mergeBackupData } from './backupFormat';
import type { Repositories } from '../../db/repositories/types';
import type { AppSettings, BackupData, BackupFile } from '../../types';

export type RestoreMode = 'merge' | 'overwrite';

/** 백업에서 제외하는 기기 전용 설정(다른 기기에서 의미가 없거나 다시 동의가 필요한 항목) */
const DEVICE_ONLY_SETTINGS: (keyof AppSettings)[] = ['pairedSensors', 'healthSyncEnabled', 'simulationEnabled', 'simulationSpeed'];

export async function collectBackupData(repos: Repositories): Promise<BackupData> {
  const [activities, trackPoints, gear, gearComponents, goals, badges, segments, segmentEfforts, planProgress, settings] = await Promise.all([
    repos.activities.listAll(),
    repos.activities.listAllTrackPoints(),
    repos.gear.list(),
    repos.gear.listComponents(),
    repos.goals.list(),
    repos.badges.list(),
    repos.segments.list(),
    repos.segments.listEfforts(),
    repos.plans.list(),
    repos.settings.getAll(),
  ]);
  const portableSettings: Partial<AppSettings> = { ...settings };
  for (const key of DEVICE_ONLY_SETTINGS) delete portableSettings[key];
  return { activities, trackPoints, gear, gearComponents, goals, badges, segments, segmentEfforts, planProgress, settings: portableSettings };
}

export async function exportBackup(repos: Repositories, appVersion: string, now: number): Promise<BackupFile> {
  return createBackupFile(await collectBackupData(repos), appVersion, now);
}

async function writeAll(repos: Repositories, data: BackupData): Promise<void> {
  const pointsByActivity = new Map<string, BackupData['trackPoints']>();
  for (const p of data.trackPoints) {
    const list = pointsByActivity.get(p.activityId) ?? [];
    list.push(p);
    pointsByActivity.set(p.activityId, list);
  }
  for (const a of data.activities) {
    const points = (pointsByActivity.get(a.id) ?? []).sort((x, y) => x.timestamp - y.timestamp);
    await repos.activities.save(a, points);
  }
  for (const g of data.gear) await repos.gear.save(g);
  for (const c of data.gearComponents) await repos.gear.saveComponent(c);
  for (const g of data.goals) await repos.goals.save(g);
  for (const b of data.badges) await repos.badges.award(b);
  for (const s of data.segments) await repos.segments.save(s);
  await repos.segments.saveEfforts(data.segmentEfforts);
  for (const p of data.planProgress) await repos.plans.save(p);
  const settings: Partial<AppSettings> = { ...data.settings };
  for (const key of DEVICE_ONLY_SETTINGS) delete settings[key];
  await repos.settings.setMany(settings);
}

export interface RestoreResult {
  activitiesAdded: number;
  activitiesTotal: number;
}

/**
 * 백업 복원.
 * - merge: 기존 데이터에 id 기준으로 없는 레코드만 추가한다.
 * - overwrite: 모든 데이터를 지우고 백업 내용으로 바꾼다(화면에서 경고 후 호출).
 * 전체를 하나의 트랜잭션으로 처리하므로 중간에 실패하면 기존 데이터가 그대로 남는다.
 */
export async function restoreBackup(repos: Repositories, file: BackupFile, mode: RestoreMode): Promise<RestoreResult> {
  let added = 0;
  let total = 0;
  await repos.transaction(async () => {
    if (mode === 'overwrite') {
      await repos.clearAll();
      await writeAll(repos, file.data);
      added = file.data.activities.length;
      total = added;
      return;
    }
    const existing = await collectBackupData(repos);
    const merged = mergeBackupData(existing, file.data);
    const existingIds = new Set(existing.activities.map((a) => a.id));
    const newOnly: BackupData = {
      activities: merged.activities.filter((a) => !existingIds.has(a.id)),
      trackPoints: merged.trackPoints.filter((p) => !existingIds.has(p.activityId)),
      gear: merged.gear.filter((g) => !existing.gear.some((e) => e.id === g.id)),
      gearComponents: merged.gearComponents.filter((c) => !existing.gearComponents.some((e) => e.id === c.id)),
      goals: merged.goals.filter((g) => !existing.goals.some((e) => e.id === g.id)),
      badges: merged.badges.filter((b) => !existing.badges.some((e) => e.id === b.id)),
      segments: merged.segments.filter((s) => !existing.segments.some((e) => e.id === s.id)),
      segmentEfforts: merged.segmentEfforts.filter((s) => !existing.segmentEfforts.some((e) => e.id === s.id)),
      planProgress: merged.planProgress.filter((p) => !existing.planProgress.some((e) => e.id === p.id)),
      settings: merged.settings,
    };
    await writeAll(repos, newOnly);
    added = newOnly.activities.length;
    total = merged.activities.length;
  });
  return { activitiesAdded: added, activitiesTotal: total };
}
