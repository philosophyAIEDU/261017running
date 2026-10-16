import { TrackingEngine, isActiveStatus, type EngineEvent } from '../../src/features/tracking/trackingEngine';
import { ORIGIN, offset, straightLine } from '../helpers/fixtures';
import type { ActivityType, RawLocation } from '../../src/types';

const T0 = 1_700_000_000_000;

function engine(type: ActivityType, autoPause = true, isIndoor = false): TrackingEngine {
  const e = new TrackingEngine({ activityId: 'x', type, autoPauseEnabled: autoPause, weightKg: 70, isIndoor });
  e.start(T0);
  return e;
}

function feed(e: TrackingEngine, locs: RawLocation[]): EngineEvent[] {
  return locs.flatMap((l) => e.addLocation(l));
}

describe('TrackingEngine', () => {
  it('일정 속도 달리기: 거리, 시간, 평균/현재 페이스', () => {
    const e = engine('run');
    const locs = straightLine({ speedMps: 3, intervalSec: 1, count: 301, start: T0 });
    feed(e, locs);
    const snap = e.snapshot(T0 + 300_000);
    expect(snap.distanceM).toBeCloseTo(900, -1);
    expect(snap.movingSec).toBe(300);
    expect(snap.avgSpeedMps).toBeCloseTo(3, 1);
    expect(snap.currentSpeedMps).toBeCloseTo(3, 1);
    expect(snap.calories).toBeGreaterThan(0);
    expect(snap.pointCount).toBe(301);
  });

  it('달리기 1km마다 음성 안내와 스플릿 이벤트(보간된 시각)', () => {
    const e = engine('run');
    const events = feed(e, straightLine({ speedMps: 4, intervalSec: 1, count: 560, start: T0 }));
    const announces = events.filter((x) => x.type === 'announce');
    const splits = events.filter((x) => x.type === 'split');
    expect(announces).toHaveLength(2);
    expect(splits).toHaveLength(2);
    if (announces[0].type === 'announce') {
      expect(announces[0].movingSec).toBeCloseTo(250, -1);
      expect(announces[0].segmentSpeedMps).toBeCloseTo(4, 0);
    }
  });

  it('자전거는 5km마다 안내', () => {
    const e = engine('ride');
    const events = feed(e, straightLine({ speedMps: 8, intervalSec: 1, count: 1300, start: T0 }));
    expect(events.filter((x) => x.type === 'announce')).toHaveLength(2);
  });

  it('노이즈(정확도 불량/순간이동) 포인트는 거리에 반영되지 않는다', () => {
    const e = engine('run', false);
    const locs = straightLine({ speedMps: 3, intervalSec: 1, count: 101, start: T0 });
    const noisy = [...locs];
    noisy[30] = { ...noisy[30], accuracy: 60 };
    noisy[60] = { ...noisy[60], ...offset(ORIGIN, 2000, 2000) };
    const events = feed(e, noisy);
    expect(events.filter((x) => x.type === 'rejected')).toHaveLength(2);
    expect(e.snapshot(T0 + 100_000).distanceM).toBeCloseTo(300, -1);
  });

  it('수동 일시정지: 시간과 그 사이 이동 거리가 빠진다', () => {
    const e = engine('walk', false);
    const a = straightLine({ speedMps: 1.2, intervalSec: 3, count: 21, start: T0 }); // 0~60초
    feed(e, a);
    e.pause(T0 + 61_000);
    expect(e.status).toBe('paused');
    // 일시정지 중 들어온 위치는 무시
    feed(e, [{ ...a[20], timestamp: T0 + 90_000 }]);
    e.resume(T0 + 121_000);
    const b = straightLine({ speedMps: 1.2, intervalSec: 3, count: 21, start: T0 + 121_000 }).map((l) => ({ ...l, ...offset(ORIGIN, 500 + (l.timestamp - T0 - 121_000) / 1000 * 1.2, 0) }));
    feed(e, b);
    const snap = e.snapshot(T0 + 181_000);
    expect(snap.movingSec).toBe(121);
    expect(snap.distanceM).toBeCloseTo(144, -1);
    expect(e.pauses).toEqual([{ start: T0 + 61_000, end: T0 + 121_000 }]);
  });

  it.each(['run', 'walk', 'ride'] as const)('%s: 멈추면 자동 일시정지, 다시 움직이면 재개(정지 시간 제외)', (type) => {
    const e = engine(type);
    const speed = type === 'walk' ? 1.3 : type === 'run' ? 3 : 7;
    const moving = straightLine({ speedMps: speed, intervalSec: 1, count: 60, start: T0 });
    feed(e, moving);
    const last = moving[moving.length - 1];
    const stopped: RawLocation[] = Array.from({ length: 20 }, (_, i) => ({ ...last, timestamp: last.timestamp + (i + 1) * 1000, speed: 0 }));
    const ev1 = feed(e, stopped);
    expect(ev1.some((x) => x.type === 'autoPaused')).toBe(true);
    expect(e.status).toBe('autoPaused');
    const resumeStart = last.timestamp + 21_000;
    const again = straightLine({ speedMps: speed, intervalSec: 1, count: 10, start: resumeStart }).map((l, i) => ({ ...l, ...offset(ORIGIN, 59 * speed + (i + 1) * speed, 0) }));
    const ev2 = feed(e, again);
    expect(ev2.some((x) => x.type === 'autoResumed')).toBe(true);
    expect(e.status).toBe('running');
    const moving_ = e.snapshot(again[again.length - 1].timestamp).movingSec;
    // 총 경과 ~90초 중 정지(약 20초)는 제외
    expect(moving_).toBeLessThan(75);
    expect(moving_).toBeGreaterThan(60);
  });

  it('위치 이벤트가 끊겨도 tick으로 자동 일시정지', () => {
    const e = engine('run');
    feed(e, straightLine({ speedMps: 3, intervalSec: 1, count: 10, start: T0 }));
    expect(e.tick(T0 + 12_000)).toEqual([]);
    const ev = e.tick(T0 + 40_000);
    expect(ev[0]?.type).toBe('autoPaused');
  });

  it('자동 일시정지를 끄면 멈춰도 계속 running', () => {
    const e = engine('run', false);
    const locs = straightLine({ speedMps: 0, intervalSec: 1, count: 30, start: T0 });
    feed(e, locs);
    expect(e.tick(T0 + 60_000)).toEqual([]);
    expect(e.status).toBe('running');
  });

  it('최고 속도는 5초 평균: 1초짜리 스파이크는 반영되지 않는다', () => {
    const e = engine('ride', false);
    const speeds = (i: number): number => (i === 50 ? 20 : 8);
    feed(e, straightLine({ speedMps: speeds, intervalSec: 1, count: 100, start: T0 }));
    const max = e.snapshot(T0 + 100_000).maxSpeedMps;
    expect(max).toBeGreaterThan(8);
    expect(max).toBeLessThan(11);
  });

  it('센서 속도가 있으면 GPS 대신 사용, 심박/케이던스 기록', () => {
    const e = engine('ride', false);
    const locs = straightLine({ speedMps: 5, intervalSec: 1, count: 20, start: T0 });
    for (const l of locs) {
      e.setSensorSpeed(9, l.timestamp);
      e.setHeartRate(150, l.timestamp);
      e.setCadence(90, l.timestamp);
      e.addLocation(l);
    }
    const snap = e.snapshot(T0 + 19_000);
    expect(snap.currentSpeedMps).toBe(9);
    expect(snap.heartRate).toBe(150);
    expect(snap.cadence).toBe(90);
    expect(snap.maxSpeedMps).toBeCloseTo(9);
    expect(e.getPoints()[5].heartRate).toBe(150);
    expect(e.getPoints()[5].sensorSpeedMps).toBe(9);
  });

  it('걸음 수 샘플은 30초마다', () => {
    const e = engine('walk');
    for (let i = 0; i <= 120; i += 1) e.setSteps(i * 2, T0 + i * 1000);
    expect(e.steps).toBe(240);
    expect(e.stepSamples.map((s) => s.steps)).toEqual([0, 60, 120, 180, 240]);
  });

  it('실내 모드는 위치를 무시하고 시간만 기록', () => {
    const e = engine('run', true, true);
    feed(e, straightLine({ speedMps: 3, intervalSec: 1, count: 10, start: T0 }));
    expect(e.getPoints()).toHaveLength(0);
    expect(e.tick(T0 + 60_000)).toEqual([]);
    expect(e.snapshot(T0 + 60_000).movingSec).toBe(60);
  });

  it('직렬화 → 복원: 앱이 꺼져 있던 시간은 일시정지로 처리', () => {
    const e = engine('run', false);
    feed(e, straightLine({ speedMps: 3, intervalSec: 1, count: 61, start: T0 }));
    const saved = e.drainUnsavedPoints();
    expect(saved).toHaveLength(61);
    expect(e.drainUnsavedPoints()).toHaveLength(0);
    const state = JSON.parse(JSON.stringify(e.serialize()));
    const restored = TrackingEngine.restore(state, saved, T0 + 300_000, T0 + 60_000);
    expect(restored.status).toBe('paused');
    expect(restored.snapshot(T0 + 300_000).distanceM).toBeCloseTo(180, -1);
    restored.resume(T0 + 300_000);
    expect(restored.snapshot(T0 + 310_000).movingSec).toBe(70);
  });

  it('종료 후에는 입력을 받지 않는다', () => {
    const e = engine('run');
    e.pause(T0 + 1000);
    e.finish(T0 + 5000);
    expect(e.status).toBe('finished');
    expect(e.endedAt).toBe(T0 + 5000);
    expect(e.pauses).toEqual([{ start: T0 + 1000, end: T0 + 5000 }]);
    expect(e.addLocation(straightLine({ speedMps: 1, intervalSec: 1, count: 1, start: T0 + 6000 })[0])).toEqual([]);
    expect(isActiveStatus('finished')).toBe(false);
    expect(isActiveStatus('autoPaused')).toBe(true);
  });
});
