import type { PauseInterval, TrackPoint } from '../../types';

// 심박 구간: 최대 심박 대비 비율.
// Zone1 50~60%, Zone2 60~70%, Zone3 70~80%, Zone4 80~90%, Zone5 90% 이상.
export const HR_ZONE_BOUNDS = [0.5, 0.6, 0.7, 0.8, 0.9];
export const HR_ZONE_LABELS = ['회복', '지방 연소', '유산소', '젖산 역치', '최대'];

export function estimateMaxHeartRate(birthYear: number | null, now: number = Date.now()): number | null {
  if (!birthYear) return null;
  const age = new Date(now).getFullYear() - birthYear;
  return age > 0 && age < 120 ? 220 - age : null;
}

export function resolveMaxHeartRate(maxHeartRate: number | null, birthYear: number | null, now: number = Date.now()): number | null {
  return maxHeartRate && maxHeartRate > 0 ? maxHeartRate : estimateMaxHeartRate(birthYear, now);
}

/** 0~4 구간 인덱스. 50% 미만은 null(구간 밖). */
export function zoneOf(hr: number, maxHr: number): number | null {
  const ratio = hr / maxHr;
  if (ratio < HR_ZONE_BOUNDS[0]) return null;
  let z = 0;
  while (z + 1 < HR_ZONE_BOUNDS.length && ratio >= HR_ZONE_BOUNDS[z + 1]) z += 1;
  return z;
}

/**
 * 구간별 체류 시간(초). 각 포인트의 심박이 다음 포인트까지 유지된다고 보고 시간 간격을 해당 구간에 더한다.
 * 일시정지가 끝난 경계(쉬는 동안)나 30초 이상 비어 있는 간격은 제외한다.
 */
export function computeHrZones(points: Pick<TrackPoint, 'timestamp' | 'heartRate'>[], pauses: PauseInterval[], maxHr: number): number[] | null {
  const zones = [0, 0, 0, 0, 0];
  let any = false;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const hr = points[i].heartRate;
    if (hr === null) continue;
    const dt = (points[i + 1].timestamp - points[i].timestamp) / 1000;
    if (dt <= 0 || dt > 30) continue;
    if (pauses.some((p) => p.end > points[i].timestamp && p.end <= points[i + 1].timestamp)) continue;
    const z = zoneOf(hr, maxHr);
    if (z === null) continue;
    zones[z] += dt;
    any = true;
  }
  return any ? zones.map((z) => Math.round(z)) : null;
}
