import { computeSplits, timeAtDistance } from '../../src/features/analysis/splits';
import {
  computeBestEfforts,
  computePersonalRecords,
  findBestEffort,
  findMaxAvgSpeed,
  newRecordsFor,
} from '../../src/features/analysis/personalRecords';
import { predictRaceTimes, riegel } from '../../src/features/analysis/racePredictor';
import { buildHeatmap, computePeriodStats, percentChange, sumTotals } from '../../src/features/analysis/stats';
import { cadenceSeries, colorizeRoute, elevationSeries, heartRateSeries, speedSeries, stepsPerBucket, averageCadence } from '../../src/features/analysis/series';
import { buildTimeline, type Timeline } from '../../src/utils/geo';
import { makeSummary, straightLine, toTrackPoints } from '../helpers/fixtures';

function tl(cum: number[], t: number[]): Timeline {
  return { cumDistanceM: cum, movingSec: t };
}

describe('스플릿', () => {
  it('1km 스플릿, 경계 시각은 선형 보간', () => {
    const pts = toTrackPoints(straightLine({ speedMps: 4, intervalSec: 1, count: 626 })); // 2.5km
    const splits = computeSplits(pts, [], 1000);
    expect(splits).toHaveLength(3);
    expect(splits[0].durationSec).toBeCloseTo(250, 0);
    expect(splits[0].avgSpeedMps).toBeCloseTo(4, 1);
    expect(splits[2].distanceM).toBeCloseTo(500, -1);
  });

  it('50m 미만의 자투리는 버린다, 포인트 부족 시 빈 배열', () => {
    const pts = toTrackPoints(straightLine({ speedMps: 4, intervalSec: 1, count: 258 })); // 1028m
    expect(computeSplits(pts, [], 1000)).toHaveLength(1);
    expect(computeSplits(pts.slice(0, 1), [], 1000)).toEqual([]);
  });

  it('심박 평균', () => {
    const pts = toTrackPoints(straightLine({ speedMps: 4, intervalSec: 1, count: 300 })).map((p) => ({ ...p, heartRate: 150 }));
    expect(computeSplits(pts, [], 1000)[0].avgHeartRate).toBe(150);
  });

  it('timeAtDistance', () => {
    const t = tl([0, 10, 20], [0, 5, 10]);
    expect(timeAtDistance(t, 15)).toBe(7.5);
    expect(timeAtDistance(t, -1)).toBe(0);
    expect(timeAtDistance(t, 100)).toBe(10);
    expect(timeAtDistance(tl([], []), 1)).toBe(0);
  });
});

describe('PR 탐지 (두 포인터 + 선형 보간)', () => {
  it('가장 빠른 구간을 찾는다', () => {
    // 0~1000m 느리게(500초), 1000~2000m 빠르게(250초), 2000~3000m 느리게
    const t = tl([0, 1000, 2000, 3000], [0, 500, 750, 1250]);
    expect(findBestEffort(t, 1000)).toBeCloseTo(250, 6);
    // 1500m: 빠른 1000m + 앞/뒤 500m(250초) 보간
    expect(findBestEffort(t, 1500)).toBeCloseTo(500, 6);
    expect(findBestEffort(t, 5000)).toBeNull();
  });

  it('포인트 사이를 보간해 정확한 시간을 계산한다', () => {
    const t = tl([0, 600, 1200], [0, 300, 600]); // 일정 2m/s
    expect(findBestEffort(t, 1000)).toBeCloseTo(500, 6);
  });

  it('실제 경로로 5K 최고 기록', () => {
    const speed = (i: number): number => (i >= 600 && i < 1600 ? 5 : 3);
    const pts = toTrackPoints(straightLine({ speedMps: speed, intervalSec: 1, count: 2400 }));
    const best = computeBestEfforts(buildTimeline(pts, []));
    expect(best['1k']).toBeCloseTo(200, 0);
    expect(Math.abs((best['5k'] ?? 0) - 1000)).toBeLessThan(3); // 픽스처 좌표 변환 오차 0.1%
    expect(best['10k']).toBeUndefined();
  });

  it('최고 속도(5초 평균)와 센서 속도', () => {
    const pts = straightLine({ speedMps: (i) => (i === 30 ? 30 : 6), intervalSec: 1, count: 60 });
    const t = buildTimeline(pts, []);
    const ts = pts.map((p) => p.timestamp);
    const max = findMaxAvgSpeed(t, ts, 5);
    expect(max).toBeLessThan(11);
    expect(max).toBeGreaterThan(6);
    const sensor = ts.map((_, i) => (i < 20 ? 10 : 7));
    expect(findMaxAvgSpeed(t, ts, 5, sensor)).toBeCloseTo(10, 6);
  });

  it('모드별 PR 분리와 모드 변경 반영', () => {
    const run = makeSummary({ id: 'r1', type: 'run', bestEfforts: { '5k': 1500, '1k': 280 }, distanceM: 6000 });
    const run2 = makeSummary({ id: 'r2', type: 'run', bestEfforts: { '5k': 1400 }, distanceM: 5200 });
    const ride = makeSummary({ id: 'b1', type: 'ride', bestEfforts: { '20k': 2400, '5k': 500 }, distanceM: 30000, maxSpeed5sMps: 12, elevationGainM: 300 });
    const runPrs = computePersonalRecords([run, run2, ride], 'run');
    expect(runPrs.find((p) => p.key === '5k')).toMatchObject({ value: 1400, activityId: 'r2' });
    expect(runPrs.find((p) => p.key === '1k')?.value).toBe(280);
    expect(runPrs.find((p) => p.key === 'longestDistance')?.value).toBe(6000);
    expect(runPrs.some((p) => p.key === '20k')).toBe(false);
    const ridePrs = computePersonalRecords([run, run2, ride], 'ride');
    expect(ridePrs.map((p) => p.key)).toEqual(['20k', 'maxSpeed', 'longestDistance', 'maxElevationGain']);
    // 자전거 기록을 달리기로 바꾸면 달리기 5K PR이 바뀐다
    const changed = { ...ride, type: 'run' as const };
    expect(computePersonalRecords([run, run2, changed], 'run').find((p) => p.key === '5k')?.activityId).toBe('b1');
  });

  it('산책: 최장 거리/시간, 하루 최다 걸음 수(같은 날 합산)', () => {
    const day = Date.UTC(2026, 9, 1, 3);
    const w1 = makeSummary({ id: 'w1', type: 'walk', startedAt: day, steps: 6000, distanceM: 4000, durationSec: 3000 });
    const w2 = makeSummary({ id: 'w2', type: 'walk', startedAt: day + 3600_000, steps: 5000, distanceM: 3000, durationSec: 4000 });
    const w3 = makeSummary({ id: 'w3', type: 'walk', startedAt: day + 86400_000 * 2, steps: 9000 });
    const prs = computePersonalRecords([w1, w2, w3], 'walk');
    expect(prs.find((p) => p.key === 'mostDailySteps')?.value).toBe(11000);
    expect(prs.find((p) => p.key === 'longestDuration')?.activityId).toBe('w2');
  });

  it('실내 기록은 거리 PR에서 제외', () => {
    const indoor = makeSummary({ type: 'run', isIndoor: true, bestEfforts: { '5k': 900 } });
    expect(computePersonalRecords([indoor], 'run').find((p) => p.key === '5k')).toBeUndefined();
  });

  it('newRecordsFor: 이번 활동이 경신한 기록만', () => {
    const old = makeSummary({ id: 'o', type: 'run', bestEfforts: { '5k': 1500, '1k': 250 }, distanceM: 5000 });
    const fresh = makeSummary({ id: 'n', type: 'run', bestEfforts: { '5k': 1450, '1k': 260 }, distanceM: 5000 });
    expect(newRecordsFor(fresh, [old]).map((r) => r.key)).toEqual(['5k']);
  });
});

describe('레이스 예측 (Riegel)', () => {
  it('공식', () => {
    expect(riegel(1200, 5000, 10000)).toBeCloseTo(1200 * 2 ** 1.06, 6);
  });

  it('목표 거리에 가까운 최근 기록을 기준으로 예측', () => {
    const now = Date.UTC(2026, 9, 15);
    const recent5k = makeSummary({ type: 'run', startedAt: now - 86400_000 * 5, bestEfforts: { '5k': 1500 }, distanceM: 5000, durationSec: 1500 });
    const recentHalf = makeSummary({ type: 'run', startedAt: now - 86400_000 * 10, bestEfforts: { half: 7200, '10k': 3300, '5k': 1600 }, distanceM: 21100, durationSec: 7210 });
    const old = makeSummary({ type: 'run', startedAt: now - 86400_000 * 400, bestEfforts: { '5k': 1000 } });
    const preds = predictRaceTimes([recent5k, recentHalf, old], now);
    expect(preds.map((p) => p.key)).toEqual(['5k', '10k', 'half', 'full']);
    expect(preds[0].predictedSec).toBe(1500);
    expect(preds[2].predictedSec).toBe(7200);
    expect(preds[3].reference.distanceM).toBeCloseTo(21097.5, 0);
    expect(predictRaceTimes([old], now)).toEqual([]);
  });
});

describe('통계', () => {
  const now = new Date(2026, 9, 16, 12).getTime(); // 금요일
  const list = [
    makeSummary({ type: 'run', startedAt: new Date(2026, 9, 13, 7).getTime(), distanceM: 5000, durationSec: 1500 }),
    makeSummary({ type: 'ride', startedAt: new Date(2026, 9, 14, 7).getTime(), distanceM: 30000, durationSec: 3600, steps: null }),
    makeSummary({ type: 'walk', startedAt: new Date(2026, 9, 2, 7).getTime(), distanceM: 3000, durationSec: 2400, steps: 4000 }),
    makeSummary({ type: 'run', startedAt: new Date(2025, 9, 14, 7).getTime(), distanceM: 10000, durationSec: 3000 }),
  ];

  it('주간: 요일별, 모드 필터', () => {
    const s = computePeriodStats(list, 'week', now, null);
    expect(s.buckets).toHaveLength(7);
    expect(s.totals.count).toBe(2);
    expect(s.totals.distanceM).toBe(35000);
    expect(computePeriodStats(list, 'week', now, 'run').totals.distanceM).toBe(5000);
  });

  it('월간/연간, 전년 동기 비교', () => {
    const m = computePeriodStats(list, 'month', now, null);
    expect(m.buckets).toHaveLength(31);
    expect(m.totals.count).toBe(3);
    expect(m.totals.steps).toBe(4000);
    expect(m.previousYear.distanceM).toBe(10000);
    const y = computePeriodStats(list, 'year', now, 'run');
    expect(y.buckets).toHaveLength(12);
    expect(y.buckets[9].totals.distanceM).toBe(5000);
    expect(percentChange(15000, 10000)).toBe(50);
    expect(percentChange(1, 0)).toBeNull();
  });

  it('히트맵: 모드별 점', () => {
    const map = buildHeatmap(list, new Date(2026, 9, 1).getTime(), 31);
    expect(map).toHaveLength(31);
    expect(map.find((d) => d.key === '2026-10-13')?.types).toEqual(['run']);
    expect(map.find((d) => d.key === '2026-10-02')?.types).toEqual(['walk']);
    expect(sumTotals([]).count).toBe(0);
  });
});

describe('그래프 시계열', () => {
  const locs = straightLine({ speedMps: 3, intervalSec: 1, count: 400, altitude: (i) => 10 + i * 0.1 });
  const pts = toTrackPoints(locs).map((p, i) => ({ ...p, heartRate: i % 2 === 0 ? 140 : null }));
  const t = buildTimeline(pts, []);

  it('속도/고도/심박', () => {
    const s = speedSeries(t);
    expect(s.length).toBeGreaterThan(5);
    expect(s[s.length - 1].y).toBeCloseTo(3, 1);
    const e = elevationSeries(pts, t);
    expect(e[e.length - 1].y).toBeGreaterThan(e[0].y);
    expect(heartRateSeries(pts, t).every((p) => p.y === 140)).toBe(true);
  });

  it('시간대별 걸음 수와 케이던스', () => {
    const start = 0;
    const samples = [
      { timestamp: 60_000, steps: 170 },
      { timestamp: 120_000, steps: 340 },
      { timestamp: 360_000, steps: 1000 },
    ];
    expect(stepsPerBucket(samples, start, [], 5)).toEqual([
      { x: 0, y: 340 },
      { x: 5, y: 660 },
    ]);
    expect(cadenceSeries(samples, start, [])[0]).toEqual({ x: 1, y: 170 });
    expect(stepsPerBucket([], 0, [])).toEqual([]);
    expect(averageCadence(1700, 600)).toBe(170);
    expect(averageCadence(null, 600)).toBeNull();
  });

  it('경로 색상 구간', () => {
    const varied = toTrackPoints(straightLine({ speedMps: (i) => (i < 100 ? 2 : 5), intervalSec: 1, count: 200 }));
    const paths = colorizeRoute(varied, []);
    expect(paths.length).toBeGreaterThan(1);
    expect(paths[0].color).not.toBe(paths[paths.length - 1].color);
    expect(colorizeRoute(varied.slice(0, 1), [])).toEqual([]);
  });
});
