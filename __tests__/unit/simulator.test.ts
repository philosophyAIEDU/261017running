import { readFileSync } from 'fs';
import { join } from 'path';
import { ACTIVITY_CONFIGS } from '../../src/features/activity/activityConfig';
import { liveMetricDisplay, visibleLiveMetrics } from '../../src/features/tracking/liveMetrics';
import { AcceleratedClock, GpxReplaySource, prepareReplay } from '../../src/features/tracking/simulator';
import { TrackingEngine, type EngineSnapshot } from '../../src/features/tracking/trackingEngine';
import type { RawLocation } from '../../src/types';

const gpx = readFileSync(join(__dirname, '..', '..', 'assets', 'gpx', 'walk.gpx'), 'utf8');

describe('GPS 시뮬레이션', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 9, 16, 7, 0, 0) }));
  afterEach(() => jest.useRealTimers());

  it('샘플 GPX를 시작 시각 기준으로 옮기고 속도는 비운다', () => {
    const start = Date.now();
    const locs = prepareReplay(gpx, start);
    expect(locs[0].timestamp).toBe(start);
    expect(locs[1].timestamp - locs[0].timestamp).toBe(3000);
    expect(locs.every((l) => l.speed === null)).toBe(true);
    expect(prepareReplay('<gpx></gpx>', start)).toEqual([]);
  });

  it('20배속 재생: 엔진이 가속된 시계로 실제와 같은 페이스를 계산한다', async () => {
    const clock = new AcceleratedClock(Date.now(), 20);
    const locs = prepareReplay(gpx, clock.now());
    const source = new GpxReplaySource(locs, clock);
    const engine = new TrackingEngine({ activityId: 's', type: 'walk', autoPauseEnabled: true, weightKg: null, isIndoor: false });
    engine.start(clock.now());
    const received: RawLocation[] = [];
    await source.start(ACTIVITY_CONFIGS.walk, (batch) => {
      received.push(...batch);
      engine.addLocations(batch);
    });
    const totalSimMs = locs[locs.length - 1].timestamp - locs[0].timestamp;
    jest.advanceTimersByTime(totalSimMs / 20 + 1000);
    expect(source.finished).toBe(true);
    expect(received).toHaveLength(locs.length);
    await source.stop();
    const snap = engine.snapshot(clock.now());
    expect(snap.distanceM).toBeGreaterThan(2400);
    expect(snap.avgSpeedMps).toBeGreaterThan(1.1);
    expect(snap.avgSpeedMps).toBeLessThan(1.6);
  });

  it('일시정지하면 재생도 멈추고, 재개 시 남은 포인트 시각을 밀어 이어서 재생', async () => {
    const clock = new AcceleratedClock(Date.now(), 1);
    const locs = prepareReplay(gpx, clock.now()).slice(0, 10);
    const source = new GpxReplaySource(locs, clock);
    const got: RawLocation[] = [];
    await source.start(ACTIVITY_CONFIGS.walk, (b) => got.push(...b));
    jest.advanceTimersByTime(6500);
    expect(got).toHaveLength(3);
    source.setPaused(true);
    jest.advanceTimersByTime(60_000);
    expect(got).toHaveLength(3);
    source.setPaused(false, 60_000);
    jest.advanceTimersByTime(3000);
    expect(got).toHaveLength(4);
    expect(got[3].timestamp - got[2].timestamp).toBe(63_000);
    await source.stop();
  });
});

describe('실시간 지표 표시', () => {
  const snap: EngineSnapshot = {
    status: 'running',
    type: 'ride',
    startedAt: 0,
    movingSec: 3723,
    distanceM: 30_500,
    currentSpeedMps: 24.5 / 3.6,
    avgSpeedMps: 1000 / 332,
    maxSpeedMps: 12,
    elevationGainM: 123.4,
    steps: 12345,
    heartRate: null,
    cadence: 88,
    calories: 512,
    lastLocation: null,
    pointCount: 10,
  };

  it('모드 설정의 지표를 형식에 맞게', () => {
    expect(liveMetricDisplay('duration', snap, 'km')).toMatchObject({ value: '1:02:03' });
    expect(liveMetricDisplay('distance', snap, 'km')).toMatchObject({ value: '30.50', unit: 'km' });
    expect(liveMetricDisplay('currentSpeed', snap, 'km')).toMatchObject({ value: '24.5', unit: 'km/h' });
    expect(liveMetricDisplay('avgPace', snap, 'km')).toMatchObject({ value: '5\'32"', unit: '/km' });
    expect(liveMetricDisplay('currentPace', snap, 'mi').unit).toBe('/mi');
    expect(liveMetricDisplay('maxSpeed', snap, 'mi').unit).toBe('mph');
    expect(liveMetricDisplay('avgSpeed', snap, 'km').label).toBe('평균 속도');
    expect(liveMetricDisplay('steps', snap, 'km').value).toMatch(/12,345/);
    expect(liveMetricDisplay('steps', { ...snap, steps: null }, 'km').value).toBe('--');
    expect(liveMetricDisplay('elevation', snap, 'km').value).toBe('123');
    expect(liveMetricDisplay('heartRate', snap, 'km').value).toBe('--');
    expect(liveMetricDisplay('heartRate', { ...snap, heartRate: 150 }, 'km').value).toBe('150');
    expect(liveMetricDisplay('cadence', snap, 'km')).toMatchObject({ value: '88', unit: 'rpm' });
    expect(liveMetricDisplay('cadence', { ...snap, type: 'run', cadence: null }, 'km')).toMatchObject({ value: '--', unit: 'spm' });
    expect(liveMetricDisplay('calories', snap, 'km').value).toBe('512');
  });

  it('센서가 없으면 심박/케이던스를 숨기고, 실내는 시간·걸음·칼로리', () => {
    expect(visibleLiveMetrics(ACTIVITY_CONFIGS.ride.liveMetrics, snap, false)).toEqual(['duration', 'distance', 'currentSpeed', 'avgSpeed', 'maxSpeed', 'elevation', 'cadence']);
    expect(visibleLiveMetrics(ACTIVITY_CONFIGS.walk.liveMetrics, snap, true)).toEqual(['duration', 'steps', 'calories']);
    expect(visibleLiveMetrics(ACTIVITY_CONFIGS.run.liveMetrics, { ...snap, steps: null }, true)).toEqual(['duration', 'calories']);
  });
});
