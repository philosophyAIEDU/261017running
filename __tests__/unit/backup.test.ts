import { BACKUP_SCHEMA_VERSION, BackupError, createBackupFile, mergeBackupData, parseBackup } from '../../src/features/backup/backupFormat';
import { collectBackupData, exportBackup, restoreBackup } from '../../src/features/backup/backupService';
import { daysSince, shouldRemindBackup } from '../../src/features/backup/backupReminder';
import { createSqliteRepositories } from '../../src/db/repositories/sqlite/SqliteRepositories';
import { migrateDatabase } from '../../src/db/schema';
import { SqlJsDatabase } from '../helpers/sqlJsDatabase';
import { makeActivity, straightLine, toTrackPoints } from '../helpers/fixtures';
import type { Repositories } from '../../src/db/repositories/types';

async function repos(): Promise<Repositories> {
  const db = await SqlJsDatabase.create();
  await migrateDatabase(db);
  return createSqliteRepositories(db);
}

async function seed(r: Repositories, prefix: string): Promise<void> {
  const a = makeActivity({ id: `${prefix}-a1`, type: 'run', gearId: `${prefix}-shoe`, details: { bestEfforts: { '5k': 1600 }, pauses: [{ start: 1, end: 2 }] } });
  const b = makeActivity({ id: `${prefix}-a2`, type: 'ride' });
  await r.activities.save(a, toTrackPoints(straightLine({ speedMps: 3, intervalSec: 1, count: 50 }), a.id).map((p) => ({ ...p, heartRate: 140 })));
  await r.activities.save(b, toTrackPoints(straightLine({ speedMps: 7, intervalSec: 1, count: 30 }), b.id));
  await r.gear.save({ id: `${prefix}-shoe`, kind: 'shoe', name: '신발', brand: '', activityTypes: ['run'], initialDistanceM: 0, retireAtM: 700000, retired: false, createdAt: 1, updatedAt: 1 });
  await r.gear.saveComponent({ id: `${prefix}-comp`, gearId: `${prefix}-shoe`, name: '깔창', installedAtGearDistanceM: 0, replaceAfterM: 1, createdAt: 1, updatedAt: 1 });
  await r.goals.save({ id: `${prefix}-goal`, activityType: 'run', period: 'week', metric: 'distance', target: 20000, createdAt: 1, updatedAt: 1 });
  await r.badges.award({ id: `${prefix}-badge`, badgeId: 'first-activity', earnedAt: 1, activityId: a.id, createdAt: 1, updatedAt: 1 });
  await r.segments.save({ id: `${prefix}-seg`, name: '언덕', start: { latitude: 1, longitude: 1 }, end: { latitude: 2, longitude: 2 }, distanceM: 300, path: [], sourceActivityId: a.id, createdAt: 1, updatedAt: 1 });
  await r.segments.saveEfforts([{ id: `${prefix}-eff`, segmentId: `${prefix}-seg`, activityId: a.id, activityType: 'run', startedAt: 1, elapsedSec: 90, distanceM: 300, createdAt: 1, updatedAt: 1 }]);
  await r.plans.save({ id: `${prefix}-plan`, planId: '10k', startedAt: 1, completedWorkoutIds: ['x'], active: true, createdAt: 1, updatedAt: 1 });
  await r.settings.setMany({ unit: 'km', weightKg: 68, pairedSensors: [{ id: 'dev', name: 'HRM', kind: 'heartRate' }] });
}

describe('백업 왕복', () => {
  it('내보낸 파일을 새 기기에 복원하면 데이터가 동일하다', async () => {
    const src = await repos();
    await seed(src, 'x');
    const file = await exportBackup(src, '1.0.0', 123);
    expect(file.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    const text = JSON.stringify(file);
    const parsed = parseBackup(text);

    const dst = await repos();
    const res = await restoreBackup(dst, parsed, 'overwrite');
    expect(res.activitiesAdded).toBe(2);
    const a = await collectBackupData(src);
    const b = await collectBackupData(dst);
    expect(b).toEqual(a);
    // 기기 전용 설정(센서 페어링)은 백업에 포함하지 않는다
    expect(file.data.settings.pairedSensors).toBeUndefined();
    expect(file.data.settings.weightKg).toBe(68);
  });

  it('합치기: 같은 파일을 두 번 복원해도 중복이 생기지 않는다', async () => {
    const src = await repos();
    await seed(src, 'x');
    const file = parseBackup(JSON.stringify(await exportBackup(src, '1.0.0', 1)));
    const dst = await repos();
    await seed(dst, 'y');
    await dst.settings.set('weightKg', 80);
    const r1 = await restoreBackup(dst, file, 'merge');
    expect(r1).toEqual({ activitiesAdded: 2, activitiesTotal: 4 });
    const r2 = await restoreBackup(dst, file, 'merge');
    expect(r2.activitiesAdded).toBe(0);
    const data = await collectBackupData(dst);
    expect(data.activities).toHaveLength(4);
    expect(data.trackPoints).toHaveLength(160);
    expect(data.gear).toHaveLength(2);
    expect(data.segmentEfforts).toHaveLength(2);
    expect(data.badges).toHaveLength(1); // 같은 배지(first-activity)는 하나만
    expect(data.settings.weightKg).toBe(80); // 기존 설정 유지
  });

  it('덮어쓰기: 기존 데이터가 사라지고 백업 내용만 남는다', async () => {
    const src = await repos();
    await seed(src, 'x');
    const file = await exportBackup(src, '1.0.0', 1);
    const dst = await repos();
    await seed(dst, 'y');
    await restoreBackup(dst, file, 'overwrite');
    const ids = (await dst.activities.listAll()).map((a) => a.id).sort();
    expect(ids).toEqual(['x-a1', 'x-a2']);
  });

  it('이전 schemaVersion(v1) 파일을 마이그레이션해 복원', async () => {
    const v1 = {
      schemaVersion: 1,
      exportedAt: 1700000000000,
      appVersion: '0.9.0',
      data: {
        activities: [
          {
            id: 'old-1',
            type: 'walk',
            startedAt: 1690000000000,
            durationSec: 3000,
            distanceM: 3500,
            avgSpeedMps: 1.17,
            maxSpeedMps: 1.9,
            elevationGainM: 12,
            steps: 4800,
            calories: 180,
            isIndoor: false,
            gearId: null,
            title: '저녁 산책',
            note: '',
            perceivedEffort: 3,
            createdAt: 1690000000000,
          },
        ],
        trackPoints: [{ activityId: 'old-1', timestamp: 1690000000000, latitude: 37.5, longitude: 127, altitude: 10, accuracy: 5 }],
        gear: [{ id: 'old-shoe', kind: 'shoe', name: '운동화', createdAt: 1 }],
        goals: [],
        badges: [{ id: 'ob', badgeId: 'first-activity', earnedAt: 5 }],
        preferences: { unit: 'mi', weightKg: 60 },
      },
    };
    const file = parseBackup(JSON.stringify(v1));
    expect(file.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    const act = file.data.activities[0];
    expect(act.updatedAt).toBe(1690000000000);
    expect(act.details.maxSpeed5sMps).toBe(1.9);
    expect(act.details.splits).toEqual([]);
    expect(file.data.trackPoints[0].heartRate).toBeNull();
    expect(file.data.gear[0]).toMatchObject({ activityTypes: ['run', 'walk'], retireAtM: 700000, retired: false });
    expect(file.data.settings).toEqual({ unit: 'mi', weightKg: 60 });

    const dst = await repos();
    await restoreBackup(dst, file, 'merge');
    expect((await dst.activities.get('old-1'))?.steps).toBe(4800);
    expect(await dst.activities.getTrackPoints('old-1')).toHaveLength(1);
    expect((await dst.settings.getAll()).unit).toBe('mi');
  });

  it('잘못된 파일은 명확한 오류', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"foo":1}')).toThrow('백업 파일이 아닙니다');
    expect(() => parseBackup(JSON.stringify({ schemaVersion: 99, data: {} }))).toThrow('새로운 앱 버전');
    expect(() => parseBackup(JSON.stringify({ schemaVersion: 0, data: {} }))).toThrow('지원하지 않는');
    expect(() => parseBackup(JSON.stringify({ schemaVersion: 2, data: { activities: [{ id: 1, type: 'swim' }] } }))).toThrow('손상');
    const minimal = parseBackup(JSON.stringify({ schemaVersion: 2, data: {} }));
    expect(minimal.data.activities).toEqual([]);
    expect(minimal.appVersion).toBe('unknown');
  });

  it('mergeBackupData는 id 기준 중복 제외, 새 활동의 포인트만 추가', () => {
    const a = makeActivity({ id: 'same' });
    const base = createBackupFile(
      { activities: [a], trackPoints: toTrackPoints(straightLine({ speedMps: 1, intervalSec: 1, count: 3 }), 'same'), gear: [], gearComponents: [], goals: [], badges: [], segments: [], segmentEfforts: [], planProgress: [], settings: { unit: 'km' } },
      '1',
      1,
    ).data;
    const incoming = { ...base, activities: [a, makeActivity({ id: 'new' })], trackPoints: [...base.trackPoints, ...toTrackPoints(straightLine({ speedMps: 1, intervalSec: 1, count: 2 }), 'new')], settings: { unit: 'mi' as const, weightKg: 50 } };
    const merged = mergeBackupData(base, incoming);
    expect(merged.activities.map((x) => x.id)).toEqual(['same', 'new']);
    expect(merged.trackPoints).toHaveLength(5);
    expect(merged.settings).toEqual({ unit: 'km', weightKg: 50 });
  });
});

describe('백업 안내', () => {
  const DAY = 86_400_000;
  it('마지막 백업 후 30일이 지나면 안내', () => {
    expect(shouldRemindBackup(0, 0, 29 * DAY)).toBe(false);
    expect(shouldRemindBackup(0, 0, 30 * DAY)).toBe(true);
    expect(shouldRemindBackup(null, 10 * DAY, 41 * DAY)).toBe(true);
    expect(shouldRemindBackup(null, null, 100 * DAY)).toBe(false);
    expect(daysSince(0, 45 * DAY + 5)).toBe(45);
  });
});
