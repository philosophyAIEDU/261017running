import { haversineDistance } from '../../utils/geo';
import type { LatLng, PrivacyZone } from '../../types';

export const PRIVACY_RADIUS_MIN_M = 200;
export const PRIVACY_RADIUS_MAX_M = 500;

export function clampPrivacyRadius(r: number): number {
  return Math.min(PRIVACY_RADIUS_MAX_M, Math.max(PRIVACY_RADIUS_MIN_M, r));
}

function inAnyZone(p: LatLng, zones: PrivacyZone[]): boolean {
  return zones.some((z) => haversineDistance(p, z) <= z.radiusM);
}

/**
 * 공유 이미지용 경로 가리기.
 * 출발 지점부터 프라이버시 존을 처음 벗어나기 전까지, 그리고 마지막으로 존에 들어간 이후 도착 지점까지를 잘라낸다.
 * (집 근처에서 시작/종료하는 경로로 집 위치가 드러나는 것을 막는다. 중간에 존을 지나치는 구간은 유지)
 */
export function hidePrivateEnds<T extends LatLng>(points: T[], zones: PrivacyZone[]): T[] {
  if (zones.length === 0 || points.length === 0) return points;
  let start = 0;
  while (start < points.length && inAnyZone(points[start], zones)) start += 1;
  let end = points.length - 1;
  while (end >= start && inAnyZone(points[end], zones)) end -= 1;
  return start > end ? [] : points.slice(start, end + 1);
}
