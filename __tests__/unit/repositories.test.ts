import { createSqliteRepositories } from '../../src/db/repositories/sqlite/SqliteRepositories';
import { DB_SCHEMA_VERSION, migrateDatabase } from '../../src/db/schema';
import { SqlJsDatabase } from '../helpers/sqlJsDatabase';
import { makeActivity, straightLine, toTrackPoints } from '../helpers/fixtures';
import type { Repositories } from '../../src/db/repositories/types';

async function setup(): Promise<{ repos: Repositories; db: SqlJsDatabase }> {
  const db = await SqlJsDatabase.create();
  await migrateDatabase(db);
  return { repos: createSqliteRepositories(db), db };
}

describe('SQLite repositories', () => {
  it('마이그레이션은 버전을 기록하고 두 번 실행해도 안전', async () => {
    const { db } = await setup();
    await migrateDatabase(db);
    expect((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []))?.user_version).toBe(DB_SCHEMA_VERSION);
  });

  it('활동 저장/조회/수정/삭제, 목록은 요약만', async () => {
    const { repos } = await setup();
    const a = makeActivity({ type: 'run', details: { bestEfforts: { '5k': 1500 } } });
    const pts = toTrackPoints(straightLine({ speedMps: 3, intervalSec: 1, count: 1500 }), a.id);
    await repos.activities.save(a, pts);
    const b = makeActivity({ type: 'ride', startedAt: a.startedAt + 1000 });
    await repos.activities.save(b, []);
    const got = await repos.activities.get(a.id);
    expect(got).toEqual(a);
    expect(await repos.activities.get('nope')).toBeNull();
    const list = await repos.activities.listSummaries();
    expect(list.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(list[1].bestEfforts['5k']).toBe(1500);
    expect('details' in list[1]).toBe(false);
    expect(await repos.activities.listSummaries({ type: 'ride' })).toHaveLength(1);
    expect(await repos.activities.listSummaries({ from: a.startedAt + 1, to: a.startedAt + 5000 })).toHaveLength(1);
    expect(await repos.activities.listSummaries({ limit: 1, offset: 1 })).toHaveLength(1);
    const points = await repos.activities.getTrackPoints(a.id);
    expect(points).toHaveLength(1500); // 999 변수 제한을 넘어도 나눠서 일괄 삽입
    expect(points[10]).toEqual(pts[10]);
    await repos.activities.update({ ...a, title: '수정됨', type: 'walk' });
    expect((await repos.activities.get(a.id))?.title).toBe('수정됨');
    expect((await repos.activities.get(a.id))?.type).toBe('walk');
    await repos.activities.delete(a.id);
    expect(await repos.activities.getTrackPoints(a.id)).toEqual([]);
    expect(await repos.activities.listAll()).toHaveLength(1);
    expect(await repos.storageBytes()).toBeGreaterThan(0);
  });

  it('진행 중 포인트 추가 저장과 복구 정보', async () => {
    const { repos } = await setup();
    const pts = toTrackPoints(straightLine({ speedMps: 3, intervalSec: 1, count: 20 }), 'live');
    await repos.activities.appendTrackPoints('live', pts.slice(0, 10), 0);
    await repos.activities.appendTrackPoints('live', pts.slice(10), 10);
    expect(await repos.activities.countTrackPoints('live')).toBe(20);
    await repos.recovery.save({ id: 'live', state: '{}', savedAt: 5 });
    expect(await repos.recovery.get()).toEqual({ id: 'live', state: '{}', savedAt: 5 });
    // 복구용 임시 포인트는 백업 대상이 아니다
    expect(await repos.activities.listAllTrackPoints()).toEqual([]);
    await repos.recovery.discard('live');
    expect(await repos.recovery.get()).toBeNull();
    expect(await repos.activities.countTrackPoints('live')).toBe(0);
    await repos.recovery.save({ id: 'x', state: '{}', savedAt: 1 });
    await repos.recovery.clear();
    expect(await repos.recovery.get()).toBeNull();
  });

  it('장비/부품', async () => {
    const { repos } = await setup();
    const g = { id: 'g', kind: 'bike' as const, name: '로드', brand: 'A', activityTypes: ['ride' as const], initialDistanceM: 10, retireAtM: 0, retired: false, createdAt: 1, updatedAt: 1 };
    await repos.gear.save(g);
    await repos.gear.saveComponent({ id: 'c', gearId: 'g', name: '체인', installedAtGearDistanceM: 0, replaceAfterM: 3_000_000, createdAt: 1, updatedAt: 1 });
    expect(await repos.gear.list()).toEqual([g]);
    expect(await repos.gear.get('g')).toEqual(g);
    expect(await repos.gear.get('none')).toBeNull();
    expect(await repos.gear.listComponents('g')).toHaveLength(1);
    expect(await repos.gear.listComponents()).toHaveLength(1);
    await repos.gear.deleteComponent('c');
    expect(await repos.gear.listComponents('g')).toHaveLength(0);
    await repos.activities.save(makeActivity({ gearId: 'g' }), []);
    await repos.gear.delete('g');
    expect(await repos.gear.list()).toEqual([]);
    expect((await repos.activities.listSummaries())[0].gearId).toBeNull();
  });

  it('목표, 배지(중복 방지), 플랜, 설정', async () => {
    const { repos } = await setup();
    const goal = { id: 'goal', activityType: null, period: 'day' as const, metric: 'steps' as const, target: 10000, createdAt: 1, updatedAt: 1 };
    await repos.goals.save(goal);
    expect(await repos.goals.list()).toEqual([goal]);
    await repos.goals.delete('goal');
    expect(await repos.goals.list()).toEqual([]);

    await repos.badges.award({ id: 'b1', badgeId: 'first-activity', earnedAt: 1, activityId: null, createdAt: 1, updatedAt: 1 });
    await repos.badges.award({ id: 'b2', badgeId: 'first-activity', earnedAt: 2, activityId: null, createdAt: 2, updatedAt: 2 });
    expect(await repos.badges.list()).toHaveLength(1);

    const plan = { id: 'p', planId: '10k', startedAt: 1, completedWorkoutIds: ['a'], active: true, createdAt: 1, updatedAt: 1 };
    await repos.plans.save(plan);
    expect(await repos.plans.list()).toEqual([plan]);
    await repos.plans.delete('p');
    expect(await repos.plans.list()).toEqual([]);

    await repos.settings.set('unit', 'mi');
    await repos.settings.setMany({ weightKg: 70, privacyZones: [{ id: 'z', name: '집', latitude: 1, longitude: 2, radiusM: 300 }] });
    expect(await repos.settings.getAll()).toEqual({ unit: 'mi', weightKg: 70, privacyZones: [{ id: 'z', name: '집', latitude: 1, longitude: 2, radiusM: 300 }] });
  });

  it('구간과 구간 기록', async () => {
    const { repos } = await setup();
    const seg = { id: 's', name: '언덕', start: { latitude: 1, longitude: 2 }, end: { latitude: 3, longitude: 4 }, distanceM: 500, path: [{ latitude: 1, longitude: 2 }], sourceActivityId: 'a', createdAt: 1, updatedAt: 1 };
    await repos.segments.save(seg);
    expect(await repos.segments.get('s')).toEqual(seg);
    expect(await repos.segments.get('x')).toBeNull();
    const effort = { id: 'e', segmentId: 's', activityId: 'a', activityType: 'run' as const, startedAt: 1, elapsedSec: 120, distanceM: 500, createdAt: 1, updatedAt: 1 };
    await repos.segments.saveEfforts([effort, { ...effort, id: 'e2', activityId: 'b', elapsedSec: 100 }]);
    expect((await repos.segments.listEfforts('s')).map((e) => e.id)).toEqual(['e2', 'e']);
    expect(await repos.segments.listEffortsForActivity('a')).toEqual([effort]);
    await repos.segments.deleteEffortsForActivity('a');
    expect(await repos.segments.listEfforts()).toHaveLength(1);
    await repos.segments.delete('s');
    expect(await repos.segments.list()).toEqual([]);
    expect(await repos.segments.listEfforts()).toEqual([]);
  });

  it('트랜잭션: 실패하면 모두 되돌린다', async () => {
    const { repos } = await setup();
    await expect(
      repos.transaction(async () => {
        await repos.activities.save(makeActivity({ id: 'tx' }), []);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await repos.activities.get('tx')).toBeNull();
    await repos.activities.save(makeActivity({ id: 'keep' }), []);
    await repos.clearAll();
    expect(await repos.activities.listAll()).toEqual([]);
  });
});
