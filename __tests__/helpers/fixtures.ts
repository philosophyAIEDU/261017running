import { ACTIVITY_CONFIGS } from '../../src/features/activity/activityConfig';
import { emptyDetails } from '../../src/features/backup/backupFormat';
import type { Activity, ActivityDetails, ActivitySummary, ActivityType, LatLng, RawLocation, TrackPoint } from '../../src/types';

export const ORIGIN: LatLng = { latitude: 37.5265, longitude: 126.9335 };
const M_PER_DEG_LAT = (6371008.8 * Math.PI) / 180; // haversine과 같은 지구 반지름

/** 원점에서 동쪽 dx m, 북쪽 dy m 떨어진 좌표 */
export function offset(base: LatLng, dx: number, dy: number): LatLng {
  return {
    latitude: base.latitude + dy / M_PER_DEG_LAT,
    longitude: base.longitude + dx / (M_PER_DEG_LAT * Math.cos((base.latitude * Math.PI) / 180)),
  };
}

/** 동쪽으로 일정 속도로 직선 이동하는 원시 위치 목록 */
export function straightLine(opts: { speedMps: number | ((i: number) => number); intervalSec: number; count: number; start?: number; accuracy?: number; altitude?: (i: number) => number | null }): RawLocation[] {
  const out: RawLocation[] = [];
  let x = 0;
  const start = opts.start ?? 1_700_000_000_000;
  for (let i = 0; i < opts.count; i += 1) {
    const v = typeof opts.speedMps === 'function' ? opts.speedMps(i) : opts.speedMps;
    if (i > 0) x += v * opts.intervalSec;
    const p = offset(ORIGIN, x, 0);
    out.push({
      timestamp: start + i * opts.intervalSec * 1000,
      latitude: p.latitude,
      longitude: p.longitude,
      altitude: opts.altitude ? opts.altitude(i) : null,
      accuracy: opts.accuracy ?? 5,
      speed: v,
    });
  }
  return out;
}

export function toTrackPoints(locs: RawLocation[], activityId = 'a1'): TrackPoint[] {
  return locs.map((l) => ({
    activityId,
    timestamp: l.timestamp,
    latitude: l.latitude,
    longitude: l.longitude,
    altitude: l.altitude,
    accuracy: l.accuracy ?? 5,
    heartRate: null,
    cadence: null,
    sensorSpeedMps: null,
  }));
}

let counter = 0;

export function makeActivity(overrides: Omit<Partial<Activity>, 'details'> & { details?: Partial<ActivityDetails> } = {}): Activity {
  counter += 1;
  const type: ActivityType = overrides.type ?? 'run';
  return {
    id: `act-${counter}`,
    type,
    startedAt: Date.UTC(2026, 9, 1, 0, 0, 0) + counter * 1000,
    durationSec: 1800,
    distanceM: 5000,
    avgSpeedMps: 5000 / 1800,
    maxSpeedMps: 3.5,
    elevationGainM: 10,
    steps: null,
    calories: 300,
    isIndoor: false,
    gearId: null,
    title: ACTIVITY_CONFIGS[type].label,
    note: '',
    perceivedEffort: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
    details: { ...emptyDetails(), ...(overrides.details ?? {}) },
  };
}

export function makeSummary(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  const { bestEfforts: _b, maxSpeed5sMps: _m, ...base } = overrides;
  const { details, ...rest } = makeActivity(base);
  return { ...rest, bestEfforts: details.bestEfforts, maxSpeed5sMps: details.maxSpeed5sMps, ...overrides };
}
