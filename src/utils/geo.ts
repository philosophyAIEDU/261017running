import type { LatLng, PauseInterval, RawLocation, TrackPoint } from '../types';

const EARTH_RADIUS_M = 6371008.8;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * 하버사인 공식으로 두 좌표 사이의 대원 거리(m)를 계산한다.
 * a = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)
 * d = 2R · atan2(√a, √(1−a))
 */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export interface NoiseFilter {
  maxAccuracyM: number;
  maxSpeedMps: number;
}

export type RejectReason = 'accuracy' | 'speed' | 'time' | 'invalid';

/**
 * GPS 노이즈 판정.
 * 1) 좌표가 유효하지 않거나 정확도 값이 없으면 버린다.
 * 2) 수평 정확도가 모드 기준(maxAccuracyM)보다 나쁘면 버린다.
 * 3) 직전에 채택한 포인트보다 시간이 같거나 이전이면 버린다(중복/역순 이벤트).
 * 4) 직전 채택 포인트 대비 계산 속도가 모드 최대 속도를 넘으면 순간이동(멀티패스 튐)으로 보고 버린다.
 *    이때 기준은 "마지막으로 채택한" 포인트이므로, 튄 포인트 하나가 이후 포인트를 연쇄로 버리게 만들지 않는다.
 */
export function checkLocation(
  location: RawLocation,
  previous: { timestamp: number; latitude: number; longitude: number } | null,
  filter: NoiseFilter,
): RejectReason | null {
  if (
    !Number.isFinite(location.latitude) ||
    !Number.isFinite(location.longitude) ||
    Math.abs(location.latitude) > 90 ||
    Math.abs(location.longitude) > 180
  ) {
    return 'invalid';
  }
  if (location.accuracy === null || location.accuracy > filter.maxAccuracyM) return 'accuracy';
  if (previous) {
    const dtSec = (location.timestamp - previous.timestamp) / 1000;
    if (dtSec <= 0) return 'time';
    const d = haversineDistance(previous, location);
    if (d / dtSec > filter.maxSpeedMps) return 'speed';
  }
  return null;
}

/** 원시 위치 목록에 노이즈 필터를 순차 적용한다(GPX 가져오기, 시뮬레이션 검증 등). */
export function filterLocations(locations: RawLocation[], filter: NoiseFilter): RawLocation[] {
  const accepted: RawLocation[] = [];
  for (const loc of locations) {
    const prev = accepted.length > 0 ? accepted[accepted.length - 1] : null;
    if (checkLocation(loc, prev, filter) === null) accepted.push(loc);
  }
  return accepted;
}

/** 두 포인트 사이에 일시정지가 끝난 적이 있으면 그 사이 이동은 거리에서 제외한다. */
export function isBreakBetween(prevTs: number, ts: number, pauses: PauseInterval[]): boolean {
  for (const p of pauses) {
    if (p.end > prevTs && p.end <= ts) return true;
  }
  return false;
}

/** 시작 시각부터 t까지 일시정지와 겹친 시간(ms). */
export function pausedMsBefore(t: number, pauses: PauseInterval[]): number {
  let total = 0;
  for (const p of pauses) {
    const s = p.start;
    const e = Math.min(p.end, t);
    if (e > s) total += e - s;
  }
  return total;
}

export interface Timeline {
  /** 각 포인트까지의 누적 이동 거리(m) */
  cumDistanceM: number[];
  /** 각 포인트까지의 누적 이동 시간(초, 일시정지 제외) */
  movingSec: number[];
}

/**
 * 포인트 배열과 일시정지 구간으로 누적 거리/이동 시간 배열을 만든다.
 * 스플릿, PR 탐지, 구간 매칭, 그래프가 모두 이 타임라인을 공유한다.
 */
export function buildTimeline(points: readonly Pick<TrackPoint, 'timestamp' | 'latitude' | 'longitude'>[], pauses: PauseInterval[], startedAt?: number): Timeline {
  const cumDistanceM: number[] = [];
  const movingSec: number[] = [];
  if (points.length === 0) return { cumDistanceM, movingSec };
  const origin = startedAt ?? points[0].timestamp;
  let dist = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (i > 0) {
      const prev = points[i - 1];
      if (!isBreakBetween(prev.timestamp, p.timestamp, pauses)) {
        dist += haversineDistance(prev, p);
      }
    }
    cumDistanceM.push(dist);
    const moving = Math.max(0, p.timestamp - origin - pausedMsBefore(p.timestamp, pauses)) / 1000;
    // 일시정지 경계에서 수치 오차로 시간이 줄어드는 것을 막는다.
    movingSec.push(i > 0 ? Math.max(moving, movingSec[i - 1]) : moving);
  }
  return { cumDistanceM, movingSec };
}

export function totalDistance(points: readonly (LatLng & { timestamp: number })[], pauses: PauseInterval[] = []): number {
  const t = buildTimeline(points, pauses);
  return t.cumDistanceM.length > 0 ? t.cumDistanceM[t.cumDistanceM.length - 1] : 0;
}

/**
 * 고도 스무딩: 중심 이동 평균(window 포인트)으로 GPS 고도의 잡음을 줄인다.
 * null 고도는 건너뛰고 평균을 낸다.
 */
export function smoothAltitudes(altitudes: (number | null)[], window = 5): (number | null)[] {
  const half = Math.floor(window / 2);
  return altitudes.map((alt, i) => {
    if (alt === null) return null;
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(altitudes.length - 1, i + half); j += 1) {
      const v = altitudes[j];
      if (v !== null) {
        sum += v;
        count += 1;
      }
    }
    return count > 0 ? sum / count : null;
  });
}

export const ELEVATION_THRESHOLD_M = 3;

/**
 * 누적 상승/하강 고도.
 * 스무딩된 고도에서 마지막 "기준 고도" 대비 3m 이상 변했을 때만 상승/하강으로 인정하고 기준을 갱신한다.
 * (매 포인트 차이를 그대로 더하면 1~2m 진동이 누적되어 평지에서도 수백 m가 쌓인다)
 */
export function elevationGainLoss(altitudes: (number | null)[], thresholdM = ELEVATION_THRESHOLD_M): { gain: number; loss: number } {
  let gain = 0;
  let loss = 0;
  let ref: number | null = null;
  for (const alt of altitudes) {
    if (alt === null) continue;
    if (ref === null) {
      ref = alt;
      continue;
    }
    const diff = alt - ref;
    if (diff >= thresholdM) {
      gain += diff;
      ref = alt;
    } else if (diff <= -thresholdM) {
      loss += -diff;
      ref = alt;
    }
  }
  return { gain, loss };
}

export function computeElevation(points: readonly Pick<TrackPoint, 'altitude'>[]): { gain: number; loss: number } {
  return elevationGainLoss(smoothAltitudes(points.map((p) => p.altitude)));
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export function getBounds(points: readonly LatLng[]): Bounds | null {
  if (points.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLon = Math.min(minLon, p.longitude);
    maxLon = Math.max(maxLon, p.longitude);
  }
  return { minLat, maxLat, minLon, maxLon };
}

/** 표시용 경로 간략화: 일정 간격(m) 이상 떨어진 포인트만 남긴다. */
export function decimatePath(points: readonly LatLng[], minGapM: number): LatLng[] {
  if (points.length <= 2) return points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
  const out: LatLng[] = [{ latitude: points[0].latitude, longitude: points[0].longitude }];
  for (let i = 1; i < points.length - 1; i += 1) {
    if (haversineDistance(out[out.length - 1], points[i]) >= minGapM) {
      out.push({ latitude: points[i].latitude, longitude: points[i].longitude });
    }
  }
  const last = points[points.length - 1];
  out.push({ latitude: last.latitude, longitude: last.longitude });
  return out;
}

export function nearestPointIndex(points: readonly LatLng[], target: LatLng): number {
  let best = -1;
  let bestD = Infinity;
  points.forEach((p, i) => {
    const d = haversineDistance(p, target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
