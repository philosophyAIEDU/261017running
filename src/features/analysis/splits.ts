import { buildTimeline, elevationGainLoss, smoothAltitudes, type Timeline } from '../../utils/geo';
import type { PauseInterval, Split, TrackPoint } from '../../types';

type SplitPoint = Pick<TrackPoint, 'timestamp' | 'latitude' | 'longitude' | 'altitude' | 'heartRate'>;

/** 누적 거리 d 지점의 이동 시간을 선형 보간으로 구한다. */
export function timeAtDistance(timeline: Timeline, d: number): number {
  const { cumDistanceM: cum, movingSec: t } = timeline;
  if (cum.length === 0) return 0;
  if (d <= cum[0]) return t[0];
  // 이진 탐색으로 cum[i] <= d < cum[i+1]인 i를 찾는다.
  let lo = 0;
  let hi = cum.length - 1;
  if (d >= cum[hi]) return t[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo];
  const ratio = span > 0 ? (d - cum[lo]) / span : 0;
  return t[lo] + (t[hi] - t[lo]) * ratio;
}

/**
 * 스플릿 계산: splitEveryM마다 경계를 긋고, 경계 통과 시각은 선형 보간으로 구한다.
 * 마지막 남은 거리(splitEveryM 미만, 50m 이상)는 부분 스플릿으로 포함한다.
 */
export function computeSplits(points: SplitPoint[], pauses: PauseInterval[], splitEveryM: number, timeline?: Timeline): Split[] {
  if (points.length < 2 || splitEveryM <= 0) return [];
  const tl = timeline ?? buildTimeline(points, pauses);
  const total = tl.cumDistanceM[tl.cumDistanceM.length - 1];
  const smoothed = smoothAltitudes(points.map((p) => p.altitude));
  const splits: Split[] = [];
  let startD = 0;
  let startT = 0;
  let index = 1;
  while (startD < total) {
    const endD = Math.min(startD + splitEveryM, total);
    const distance = endD - startD;
    if (endD === total && distance < 50 && splits.length > 0) break;
    const endT = timeAtDistance(tl, endD);
    const duration = Math.max(0, endT - startT);
    const inRange: number[] = [];
    const alts: (number | null)[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const c = tl.cumDistanceM[i];
      if (c >= startD && c <= endD) {
        inRange.push(i);
        alts.push(smoothed[i]);
      }
    }
    const hrs = inRange.map((i) => points[i].heartRate).filter((h): h is number => h !== null);
    splits.push({
      index,
      distanceM: distance,
      durationSec: duration,
      avgSpeedMps: duration > 0 ? distance / duration : 0,
      elevationGainM: elevationGainLoss(alts).gain,
      avgHeartRate: hrs.length > 0 ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
    });
    startD = endD;
    startT = endT;
    index += 1;
  }
  return splits;
}
