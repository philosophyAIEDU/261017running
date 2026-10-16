import { buildTimeline, decimatePath, haversineDistance, type Timeline } from '../../utils/geo';
import type { LatLng, PauseInterval, Segment, SegmentEffort, TrackPoint } from '../../types';

export const SEGMENT_RADIUS_M = 25;
export const SEGMENT_DISTANCE_TOLERANCE = 0.15;

export interface SegmentMatch {
  startIndex: number;
  endIndex: number;
  elapsedSec: number;
  distanceM: number;
  startedAt: number;
}

type MatchPoint = Pick<TrackPoint, 'timestamp' | 'latitude' | 'longitude'>;

/**
 * 반경 안에 연속으로 머무는 포인트 묶음에서 중심에 가장 가까운 포인트를 고른다.
 * GPS 간격 때문에 반경에 처음 들어온 포인트를 쓰면 기록이 몇 초씩 달라지므로, 가장 가까운 지점을 통과 시점으로 본다.
 */
function closestInCluster(points: MatchPoint[], from: number, center: LatLng, radius: number): { index: number; next: number } {
  let bestIndex = from;
  let bestD = haversineDistance(points[from], center);
  let k = from + 1;
  while (k < points.length) {
    const d = haversineDistance(points[k], center);
    if (d > radius) break;
    if (d < bestD) {
      bestD = d;
      bestIndex = k;
    }
    k += 1;
  }
  return { index: bestIndex, next: k };
}

/**
 * 내 구간 매칭.
 * 1) 시작점 반경 25m 안을 지나간 지점을 찾는다(반경 안 포인트 중 가장 가까운 것).
 * 2) 그 이후 끝점 반경 25m 안에 도달한 지점을 찾는다.
 * 3) 두 지점 사이 이동 거리가 구간 거리의 ±15% 이내일 때만 유효한 기록으로 인정한다.
 *    (반대 방향 통과, 중간에 다른 길로 돌아간 경우를 걸러낸다)
 * 한 활동에서 같은 구간을 여러 번 지나가면 모두 기록한다.
 */
export function matchSegment(
  points: MatchPoint[],
  segment: Pick<Segment, 'start' | 'end' | 'distanceM'>,
  pauses: PauseInterval[] = [],
  timeline?: Timeline,
): SegmentMatch[] {
  if (points.length < 2) return [];
  const tl = timeline ?? buildTimeline(points, pauses);
  const matches: SegmentMatch[] = [];
  let i = 0;
  while (i < points.length) {
    if (haversineDistance(points[i], segment.start) > SEGMENT_RADIUS_M) {
      i += 1;
      continue;
    }
    const start = closestInCluster(points, i, segment.start, SEGMENT_RADIUS_M);
    let found: SegmentMatch | null = null;
    const maxDistance = segment.distanceM * (1 + SEGMENT_DISTANCE_TOLERANCE);
    for (let j = start.index + 1; j < points.length; j += 1) {
      const traveled = tl.cumDistanceM[j] - tl.cumDistanceM[start.index];
      if (traveled > maxDistance + SEGMENT_RADIUS_M * 2) break;
      if (haversineDistance(points[j], segment.end) <= SEGMENT_RADIUS_M) {
        const end = closestInCluster(points, j, segment.end, SEGMENT_RADIUS_M);
        const distance = tl.cumDistanceM[end.index] - tl.cumDistanceM[start.index];
        const ratio = Math.abs(distance - segment.distanceM) / segment.distanceM;
        if (ratio <= SEGMENT_DISTANCE_TOLERANCE) {
          found = {
            startIndex: start.index,
            endIndex: end.index,
            elapsedSec: tl.movingSec[end.index] - tl.movingSec[start.index],
            distanceM: distance,
            startedAt: points[start.index].timestamp,
          };
        }
        break;
      }
    }
    if (found) {
      matches.push(found);
      i = found.endIndex + 1;
    } else {
      i = start.next;
    }
  }
  return matches;
}

/** 지난 활동 경로에서 시작/끝 인덱스를 골라 구간을 만든다. */
export function buildSegmentFromRoute(
  points: MatchPoint[],
  startIndex: number,
  endIndex: number,
  pauses: PauseInterval[] = [],
): Pick<Segment, 'start' | 'end' | 'distanceM' | 'path'> | null {
  if (startIndex < 0 || endIndex >= points.length || endIndex <= startIndex) return null;
  const slice = points.slice(startIndex, endIndex + 1);
  const tl = buildTimeline(slice, pauses);
  const distanceM = tl.cumDistanceM[tl.cumDistanceM.length - 1];
  if (distanceM < SEGMENT_RADIUS_M * 4) return null; // 100m 미만 구간은 반경 판정과 겹쳐 의미가 없다
  return {
    start: { latitude: slice[0].latitude, longitude: slice[0].longitude },
    end: { latitude: slice[slice.length - 1].latitude, longitude: slice[slice.length - 1].longitude },
    distanceM,
    path: decimatePath(slice, 15),
  };
}

export interface RankedEffort extends SegmentEffort {
  rank: number;
}

/** 같은 구간이라도 모드별로 순위를 분리한다. */
export function rankEfforts(efforts: SegmentEffort[]): RankedEffort[] {
  return [...efforts]
    .sort((a, b) => a.elapsedSec - b.elapsedSec || a.startedAt - b.startedAt)
    .map((e, idx) => ({ ...e, rank: idx + 1 }));
}

/** 이번 활동의 기록이 해당 모드에서 몇 위인지, 최고 기록 경신인지 */
export function effortResult(effort: SegmentEffort, allEfforts: SegmentEffort[]): { rank: number; total: number; isBest: boolean } {
  const same = allEfforts.filter((e) => e.segmentId === effort.segmentId && e.activityType === effort.activityType);
  const withThis = same.some((e) => e.id === effort.id) ? same : [...same, effort];
  const ranked = rankEfforts(withThis);
  const rank = ranked.find((e) => e.id === effort.id)?.rank ?? ranked.length;
  return { rank, total: ranked.length, isBest: rank === 1 };
}
