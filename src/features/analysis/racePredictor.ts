import { BEST_EFFORT_DISTANCES } from './personalRecords';
import type { ActivitySummary, BestEffortKey } from '../../types';

export const RIEGEL_EXPONENT = 1.06;
const RECENT_WINDOW_MS = 120 * 24 * 60 * 60 * 1000;

/** Riegel 공식: T2 = T1 × (D2 / D1)^1.06 */
export function riegel(t1Sec: number, d1M: number, d2M: number): number {
  return t1Sec * (d2M / d1M) ** RIEGEL_EXPONENT;
}

export interface RaceReference {
  distanceM: number;
  timeSec: number;
  activityId: string;
  startedAt: number;
}

export interface RacePrediction {
  key: BestEffortKey;
  label: string;
  distanceM: number;
  predictedSec: number;
  reference: RaceReference;
}

export const PREDICTION_TARGETS: BestEffortKey[] = ['5k', '10k', 'half', 'full'];

/**
 * 최근 120일 달리기 기록에서 예측 기준을 고른다.
 * - 후보: 각 활동의 표준 거리 최고 기록(1K는 짧아 오차가 커서 제외)과 3km 이상 활동 전체 기록
 * - 목표 거리마다 거리 비율(log)이 가장 가까운 후보를 기준으로 쓰고, 비슷하면 더 좋은 예측(빠른 기록)을 고른다.
 *   거리가 멀수록 Riegel 공식 오차가 커지므로 가까운 거리의 기록을 우선한다.
 */
export function predictRaceTimes(activities: ActivitySummary[], now: number = Date.now()): RacePrediction[] {
  const candidates: RaceReference[] = [];
  for (const a of activities) {
    if (a.type !== 'run' || a.isIndoor || now - a.startedAt > RECENT_WINDOW_MS) continue;
    for (const key of ['5k', '10k', 'half', 'full'] as BestEffortKey[]) {
      const t = a.bestEfforts[key];
      if (t !== undefined) candidates.push({ distanceM: BEST_EFFORT_DISTANCES[key].meters, timeSec: t, activityId: a.id, startedAt: a.startedAt });
    }
    if (a.distanceM >= 3000 && a.durationSec > 0) {
      candidates.push({ distanceM: a.distanceM, timeSec: a.durationSec, activityId: a.id, startedAt: a.startedAt });
    }
  }
  if (candidates.length === 0) return [];
  return PREDICTION_TARGETS.map((key) => {
    const d2 = BEST_EFFORT_DISTANCES[key].meters;
    let best: { ref: RaceReference; predicted: number; score: number } | null = null;
    for (const ref of candidates) {
      const predicted = riegel(ref.timeSec, ref.distanceM, d2);
      // 거리 차이 점수(0.1 단위로 반올림해 비슷한 거리끼리는 예측 기록으로 비교)
      const score = Math.round(Math.abs(Math.log(d2 / ref.distanceM)) * 10) / 10;
      if (best === null || score < best.score || (score === best.score && predicted < best.predicted)) {
        best = { ref, predicted, score };
      }
    }
    const chosen = best as { ref: RaceReference; predicted: number };
    return { key, label: BEST_EFFORT_DISTANCES[key].label, distanceM: d2, predictedSec: Math.round(chosen.predicted), reference: chosen.ref };
  });
}
