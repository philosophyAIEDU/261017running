import { buildSegmentFromRoute, effortResult, matchSegment, rankEfforts } from '../../src/features/analysis/segments';
import { ORIGIN, offset, straightLine, toTrackPoints } from '../helpers/fixtures';
import type { SegmentEffort, TrackPoint } from '../../src/types';

// 동쪽으로 2km 직선 경로, 3m/s, 1초 간격
const route = toTrackPoints(straightLine({ speedMps: 3, intervalSec: 1, count: 667 }));
const segment = { start: offset(ORIGIN, 500, 0), end: offset(ORIGIN, 1500, 0), distanceM: 1000 };

describe('내 구간 매칭', () => {
  it('시작점 25m 안 → 끝점 25m 안, 거리 ±15% 이내면 기록', () => {
    const m = matchSegment(route, segment);
    expect(m).toHaveLength(1);
    expect(m[0].distanceM).toBeCloseTo(1000, -1);
    expect(m[0].elapsedSec).toBeCloseTo(333, 0);
  });

  it('반대 방향으로 지나가면 기록하지 않는다', () => {
    const reversed = [...route].reverse().map((p, i) => ({ ...p, timestamp: route[i].timestamp }));
    expect(matchSegment(reversed, segment)).toHaveLength(0);
  });

  it('경로가 25m 이상 떨어져 있으면 매칭 안 됨', () => {
    const shifted = route.map((p) => ({ ...p, ...offset(p, 0, 40) }));
    expect(matchSegment(shifted, segment)).toHaveLength(0);
  });

  it('돌아가서 이동 거리가 15%를 넘으면 무효', () => {
    // 시작점 통과 후 북쪽으로 200m 갔다가 돌아와 끝점 도달 (총 1400m)
    const pts: TrackPoint[] = [];
    let t = 0;
    const push = (dx: number, dy: number): void => {
      pts.push({ ...route[0], ...offset(ORIGIN, dx, dy), timestamp: route[0].timestamp + t * 1000 });
      t += 1;
    };
    for (let x = 400; x <= 1000; x += 3) push(x, 0);
    for (let y = 3; y <= 200; y += 3) push(1000, y);
    for (let y = 200; y >= 0; y -= 3) push(1000, y);
    for (let x = 1003; x <= 1600; x += 3) push(x, 0);
    expect(matchSegment(pts, segment)).toHaveLength(0);
  });

  it('한 활동에서 여러 번 지나가면 모두 기록 (왕복 2회)', () => {
    const lap = straightLine({ speedMps: 3, intervalSec: 1, count: 667 });
    const back = [...lap].reverse();
    const twice = [...lap, ...back.slice(1), ...lap.slice(1)].map((l, i) => ({ ...l, timestamp: lap[0].timestamp + i * 1000 }));
    expect(matchSegment(toTrackPoints(twice), segment)).toHaveLength(2);
  });

  it('지난 경로에서 구간 만들기', () => {
    const s = buildSegmentFromRoute(route, 100, 400);
    expect(s?.distanceM).toBeCloseTo(900, -1);
    expect(s?.path.length).toBeGreaterThan(2);
    expect(buildSegmentFromRoute(route, 10, 20)).toBeNull(); // 100m 미만
    expect(buildSegmentFromRoute(route, 400, 100)).toBeNull();
  });
});

describe('구간 순위 (모드별 분리)', () => {
  const e = (id: string, activityType: 'run' | 'ride', elapsedSec: number): SegmentEffort => ({
    id,
    segmentId: 's',
    activityId: id,
    activityType,
    startedAt: 0,
    elapsedSec,
    distanceM: 1000,
    createdAt: 0,
    updatedAt: 0,
  });

  it('같은 구간이라도 달리기와 자전거 순위는 따로', () => {
    const all = [e('r1', 'run', 300), e('r2', 'run', 280), e('b1', 'ride', 120)];
    expect(effortResult(e('r3', 'run', 270), all)).toEqual({ rank: 1, total: 3, isBest: true });
    expect(effortResult(all[0], all)).toEqual({ rank: 2, total: 2, isBest: false });
    expect(effortResult(all[2], all)).toEqual({ rank: 1, total: 1, isBest: true });
    expect(rankEfforts(all).map((x) => x.id)).toEqual(['b1', 'r2', 'r1']);
  });
});
