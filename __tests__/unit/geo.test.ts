import { ACTIVITY_CONFIGS } from '../../src/features/activity/activityConfig';
import {
  buildTimeline,
  checkLocation,
  computeElevation,
  decimatePath,
  elevationGainLoss,
  filterLocations,
  getBounds,
  haversineDistance,
  isBreakBetween,
  nearestPointIndex,
  pausedMsBefore,
  smoothAltitudes,
  totalDistance,
} from '../../src/utils/geo';
import { ORIGIN, offset, straightLine } from '../helpers/fixtures';
import type { RawLocation } from '../../src/types';

describe('haversineDistance', () => {
  it('위도 1도는 약 111.2km', () => {
    const d = haversineDistance({ latitude: 37, longitude: 127 }, { latitude: 38, longitude: 127 });
    expect(d).toBeGreaterThan(111_100);
    expect(d).toBeLessThan(111_300);
  });

  it('서울시청-부산시청 약 325km', () => {
    const d = haversineDistance({ latitude: 37.5663, longitude: 126.9779 }, { latitude: 35.1798, longitude: 129.075 });
    expect(d / 1000).toBeCloseTo(325, -1);
  });

  it('같은 좌표는 0, 대칭성', () => {
    const a = ORIGIN;
    const b = offset(ORIGIN, 300, 400);
    expect(haversineDistance(a, a)).toBe(0);
    expect(haversineDistance(a, b)).toBeCloseTo(haversineDistance(b, a), 6);
    expect(Math.abs(haversineDistance(a, b) - 500)).toBeLessThan(1.5);
  });
});

function loc(dx: number, t: number, accuracy: number | null = 5): RawLocation {
  const p = offset(ORIGIN, dx, 0);
  return { ...p, timestamp: t, accuracy, altitude: null, speed: null };
}

describe('모드별 GPS 노이즈 필터', () => {
  const prev = { ...ORIGIN, timestamp: 0 };

  it.each([
    ['run', 20, 12],
    ['walk', 20, 4],
    ['ride', 25, 25],
  ] as const)('%s: 정확도 %im 초과, 속도 %im/s 초과는 버린다', (type, maxAcc, maxSpeed) => {
    const filter = ACTIVITY_CONFIGS[type].filter;
    expect(checkLocation(loc(1, 1000, maxAcc), prev, filter)).toBeNull();
    expect(checkLocation(loc(1, 1000, maxAcc + 1), prev, filter)).toBe('accuracy');
    expect(checkLocation(loc(maxSpeed * 0.95, 1000), prev, filter)).toBeNull();
    expect(checkLocation(loc(maxSpeed * 1.1, 1000), prev, filter)).toBe('speed');
  });

  it('자전거 속도(10m/s)는 산책 모드에서만 튐으로 판정', () => {
    const l = loc(10, 1000);
    expect(checkLocation(l, prev, ACTIVITY_CONFIGS.walk.filter)).toBe('speed');
    expect(checkLocation(l, prev, ACTIVITY_CONFIGS.run.filter)).toBeNull();
    expect(checkLocation(l, prev, ACTIVITY_CONFIGS.ride.filter)).toBeNull();
  });

  it('정확도 없음, 시간 역순, 잘못된 좌표', () => {
    const f = ACTIVITY_CONFIGS.run.filter;
    expect(checkLocation(loc(1, 1000, null), prev, f)).toBe('accuracy');
    expect(checkLocation(loc(1, 0), prev, f)).toBe('time');
    expect(checkLocation({ ...loc(1, 1000), latitude: 95 }, prev, f)).toBe('invalid');
    expect(checkLocation({ ...loc(1, 1000), longitude: Number.NaN }, null, f)).toBe('invalid');
  });

  it('filterLocations는 튄 포인트 하나가 이후 포인트를 연쇄로 버리지 않는다', () => {
    const locs = straightLine({ speedMps: 3, intervalSec: 1, count: 10 });
    const jumped = { ...locs[4], ...offset(ORIGIN, 500, 300) };
    const noisy = [...locs.slice(0, 4), jumped, ...locs.slice(5)];
    const kept = filterLocations(noisy, ACTIVITY_CONFIGS.run.filter);
    expect(kept).toHaveLength(9);
    expect(kept).not.toContain(jumped);
  });
});

describe('타임라인과 일시정지', () => {
  const pts = straightLine({ speedMps: 2, intervalSec: 10, count: 7 }); // 0..60초, 20m 간격

  it('일시정지 없이 누적 거리와 시간', () => {
    const tl = buildTimeline(pts, []);
    expect(tl.cumDistanceM[6]).toBeCloseTo(120, 0);
    expect(tl.movingSec[6]).toBe(60);
    expect(totalDistance(pts)).toBeCloseTo(120, 0);
  });

  it('일시정지 구간은 시간에서 빼고, 그 사이 이동은 거리에서 제외', () => {
    const t0 = pts[0].timestamp;
    const pauses = [{ start: t0 + 21_000, end: t0 + 39_000 }];
    const tl = buildTimeline(pts, pauses);
    expect(tl.cumDistanceM[6]).toBeCloseTo(100, 0); // 30초→40초 사이 20m 제외
    expect(tl.movingSec[6]).toBe(42);
    expect(isBreakBetween(t0 + 30_000, t0 + 40_000, pauses)).toBe(true);
    expect(isBreakBetween(t0 + 40_000, t0 + 50_000, pauses)).toBe(false);
    expect(pausedMsBefore(t0 + 30_000, pauses)).toBe(9000);
  });

  it('빈 배열', () => {
    expect(buildTimeline([], [])).toEqual({ cumDistanceM: [], movingSec: [] });
    expect(totalDistance([])).toBe(0);
  });
});

describe('고도 스무딩과 누적 상승', () => {
  it('±1.5m 잡음은 3m 임계값 때문에 쌓이지 않는다', () => {
    const noisy = Array.from({ length: 200 }, (_, i) => 50 + (i % 2 === 0 ? 1.4 : -1.4));
    expect(elevationGainLoss(noisy).gain).toBe(0);
    expect(computeElevation(noisy.map((altitude) => ({ altitude }))).gain).toBe(0);
  });

  it('꾸준한 오르막 30m → 약 30m 상승, 내리막은 하강', () => {
    const up = Array.from({ length: 31 }, (_, i) => 10 + i);
    const down = Array.from({ length: 31 }, (_, i) => 40 - i);
    const r = elevationGainLoss([...up, ...down]);
    expect(r.gain).toBeGreaterThanOrEqual(27);
    expect(r.gain).toBeLessThanOrEqual(30);
    expect(r.loss).toBeGreaterThanOrEqual(27);
  });

  it('스무딩은 null을 건너뛴다', () => {
    expect(smoothAltitudes([10, null, 20], 3)).toEqual([10, null, 20]);
    expect(smoothAltitudes([10, 20, 30], 3)).toEqual([15, 20, 25]);
  });
});

describe('기타 유틸', () => {
  it('bounds, decimate, nearest', () => {
    const pts = straightLine({ speedMps: 1, intervalSec: 1, count: 50 });
    expect(getBounds([])).toBeNull();
    const b = getBounds(pts);
    expect(b?.minLon).toBeLessThan(b?.maxLon ?? 0);
    const d = decimatePath(pts, 10);
    expect(d.length).toBeLessThan(10);
    expect(d[0].latitude).toBe(pts[0].latitude);
    expect(decimatePath(pts.slice(0, 2), 10)).toHaveLength(2);
    expect(nearestPointIndex(pts, pts[20])).toBe(20);
  });
});
