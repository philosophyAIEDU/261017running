import { changeSavedActivityType, saveActivity, toSummary } from '../../src/features/activity/activityService';
import { computePersonalRecords } from '../../src/features/analysis/personalRecords';
import { buildActivity } from '../../src/features/tracking/activityBuilder';
import { createSqliteRepositories } from '../../src/db/repositories/sqlite/SqliteRepositories';
import { migrateDatabase } from '../../src/db/schema';
import { SqlJsDatabase } from '../helpers/sqlJsDatabase';
import { ORIGIN, offset, straightLine, toTrackPoints } from '../helpers/fixtures';
import type { Repositories } from '../../src/db/repositories/types';
import type { ActivityType } from '../../src/types';

async function repos(): Promise<Repositories> {
  const db = await SqlJsDatabase.create();
  await migrateDatabase(db);
  return createSqliteRepositories(db);
}

function build(id: string, type: ActivityType, speed: number, start: number): ReturnType<typeof buildActivity> {
  const points = toTrackPoints(straightLine({ speedMps: speed, intervalSec: 1, count: Math.ceil(5200 / speed), start }), id);
  return buildActivity({
    id,
    type,
    startedAt: start,
    endedAt: points[points.length - 1].timestamp,
    points,
    pauses: [],
    steps: null,
    stepSamples: [],
    workout: { kind: 'free', target: null, interval: null, planWorkoutId: null },
    source: 'gps',
    weightKg: null,
    maxHeartRate: null,
    gearId: null,
    isIndoor: false,
    now: start,
  });
}

async function getOrThrow(r: Repositories, id: string): Promise<NonNullable<Awaited<ReturnType<Repositories['activities']['get']>>>> {
  const a = await r.activities.get(id);
  if (!a) throw new Error(id);
  return a;
}

describe('활동 저장 후처리', () => {
  it('PR 경신, 배지, 내 구간 기록(모드별 순위)', async () => {
    const r = await repos();
    const t = new Date(2026, 9, 10, 7).getTime();
    await r.segments.save({ id: 'seg', name: '한강 1km', start: offset(ORIGIN, 1000, 0), end: offset(ORIGIN, 2000, 0), distanceM: 1000, path: [], sourceActivityId: 'x', createdAt: 0, updatedAt: 0 });

    const first = build('r1', 'run', 3, t);
    const out1 = await saveActivity(r, first, toTrackPoints(straightLine({ speedMps: 3, intervalSec: 1, count: Math.ceil(5200 / 3), start: t }), 'r1'), t);
    expect(out1.newRecords.map((x) => x.key)).toEqual(expect.arrayContaining(['1k', '5k', 'longestDistance']));
    expect(out1.newBadges.map((b) => b.id)).toEqual(expect.arrayContaining(['first-activity', 'run-first-5k']));
    expect(out1.segmentResults).toHaveLength(1);
    expect(out1.segmentResults[0]).toMatchObject({ rank: 1, total: 1, isBest: true });

    const second = build('r2', 'run', 2.5, t + 86400_000);
    const out2 = await saveActivity(r, second, toTrackPoints(straightLine({ speedMps: 2.5, intervalSec: 1, count: Math.ceil(5200 / 2.5), start: t + 86400_000 }), 'r2'), t + 86400_000);
    expect(out2.newRecords).toEqual([]); // 더 느리고 거리도 같으므로 경신 없음
    expect(out2.newBadges).toEqual([]);
    expect(out2.segmentResults[0]).toMatchObject({ rank: 2, total: 2, isBest: false });

    // 저장 후 모드 변경: 달리기 → 자전거. PR과 구간 순위가 모드별로 다시 계산된다.
    const changed = await changeSavedActivityType(r, await getOrThrow(r, 'r2'), 'ride', null, null, t + 2 * 86400_000);
    expect(changed.type).toBe('ride');
    expect(changed.details.splits).toHaveLength(2);
    const summaries = await r.activities.listSummaries();
    expect(computePersonalRecords(summaries, 'run').find((p) => p.key === 'longestDistance')?.activityId).toBe('r1');
    expect(computePersonalRecords(summaries, 'ride').find((p) => p.key === 'longestDistance')?.activityId).toBe('r2');
    const efforts = await r.segments.listEffortsForActivity('r2');
    expect(efforts[0].activityType).toBe('ride');
    expect(toSummary(changed).bestEfforts).toEqual(changed.details.bestEfforts);
  });
});
