import { buildActivity, changeActivityType, defaultTitle, totalPausedMs, type BuildInput } from '../../src/features/tracking/activityBuilder';
import { straightLine, toTrackPoints } from '../helpers/fixtures';

const T0 = new Date(2026, 9, 16, 7, 0).getTime();

function input(overrides: Partial<BuildInput> = {}): BuildInput {
  const points = toTrackPoints(straightLine({ speedMps: 3, intervalSec: 1, count: 1201, start: T0, altitude: (i) => 20 + Math.floor(i / 100) * 2 }), 'a1').map((p) => ({ ...p, heartRate: 150 }));
  return {
    id: 'a1',
    type: 'run',
    startedAt: T0,
    endedAt: T0 + 1_260_000,
    points,
    pauses: [{ start: T0 + 1_200_000, end: T0 + 1_260_000 }],
    steps: 3400,
    stepSamples: [],
    workout: { kind: 'free', target: null, interval: null, planWorkoutId: null },
    source: 'gps',
    weightKg: 70,
    maxHeartRate: 190,
    gearId: null,
    isIndoor: false,
    now: T0 + 2_000_000,
    ...overrides,
  };
}

describe('활동 레코드 계산', () => {
  it('달리기 요약, 스플릿, 최고 기록, 심박', () => {
    const a = buildActivity(input());
    expect(a.durationSec).toBe(1200);
    expect(a.distanceM).toBeCloseTo(3600, -1);
    expect(a.avgSpeedMps).toBeCloseTo(3, 1);
    expect(a.details.splits).toHaveLength(4);
    expect(a.details.bestEfforts['1k']).toBeCloseTo(333, 0);
    expect(a.details.avgHeartRate).toBe(150);
    expect(a.details.hrZonesSec?.[2]).toBeGreaterThan(1000);
    expect(a.details.avgCadence).toBe(170);
    expect(a.elevationGainM).toBeGreaterThan(15);
    expect(a.calories).toBeGreaterThan(200);
    expect(a.title).toBe('아침 달리기');
  });

  it('실내 모드는 입력 거리 사용, 스플릿/PR 없음', () => {
    const a = buildActivity(input({ isIndoor: true, manualDistanceM: 4000, points: [], pauses: [], endedAt: T0 + 1_200_000 }));
    expect(a.distanceM).toBe(4000);
    expect(a.details.splits).toEqual([]);
    expect(a.details.bestEfforts).toEqual({});
    expect(a.title).toBe('아침 트레드밀');
  });

  it('저장 후 모드 변경: 스플릿 간격과 칼로리, 기본 제목이 바뀐다', () => {
    const a = buildActivity(input());
    const ride = changeActivityType(a, input().points, 'ride', 70, 190, T0 + 3_000_000);
    expect(ride.type).toBe('ride');
    expect(ride.details.splits).toHaveLength(1); // 5km 단위
    expect(ride.calories).not.toBe(a.calories);
    expect(ride.title).toBe('아침 자전거');
    expect(ride.durationSec).toBe(a.durationSec);
    const custom = changeActivityType({ ...a, title: '한강 러닝' }, input().points, 'walk', 70, 190, 0);
    expect(custom.title).toBe('한강 러닝');
  });

  it('제목과 일시정지 합계', () => {
    expect(defaultTitle('walk', new Date(2026, 0, 1, 5).getTime(), false)).toBe('새벽 산책');
    expect(defaultTitle('ride', new Date(2026, 0, 1, 22).getTime(), false)).toBe('밤 자전거');
    expect(totalPausedMs([{ start: 0, end: 100 }, { start: 200, end: 1000 }], 500)).toBe(400);
  });
});
