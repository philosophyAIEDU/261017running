import { ACTIVITY_CONFIGS, ACTIVITY_TYPES } from './activityConfig';
import type { ActivityType } from '../../types';

/**
 * 평균 속도에 가장 잘 맞는 모드를 추정한다.
 * 그럴듯한 속도 범위(plausibleAvgSpeedMps)에 들어가는 모드 중
 * 대표 속도(typicalSpeedMps)와의 로그 거리가 가장 가까운 모드를 고른다.
 * (걷기 1.8m/s는 산책·달리기 범위에 모두 속하므로 대표 속도로 판정)
 * 어느 범위에도 들지 않으면 null.
 */
export function estimateActivityType(avgSpeedMps: number): ActivityType | null {
  if (!Number.isFinite(avgSpeedMps) || avgSpeedMps <= 0) return null;
  let best: ActivityType | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const type of ACTIVITY_TYPES) {
    const c = ACTIVITY_CONFIGS[type];
    const [min, max] = c.plausibleAvgSpeedMps;
    if (avgSpeedMps < min || avgSpeedMps > max) continue;
    const score = Math.abs(Math.log(avgSpeedMps / c.typicalSpeedMps));
    if (score < bestScore) {
      bestScore = score;
      best = type;
    }
  }
  return best;
}

/**
 * 모드 오선택 감지: 평균 속도가 현재 모드의 범위를 벗어나면 다른 모드를 제안한다.
 * 범위 안이면 null(제안 없음). 거리/시간이 너무 짧은 기록은 판정하지 않는다.
 */
export function suggestModeChange(
  currentType: ActivityType,
  avgSpeedMps: number,
  distanceM: number,
  durationSec: number,
): ActivityType | null {
  if (distanceM < 300 || durationSec < 120) return null;
  const [min, max] = ACTIVITY_CONFIGS[currentType].plausibleAvgSpeedMps;
  if (avgSpeedMps >= min && avgSpeedMps <= max) return null;
  const estimated = estimateActivityType(avgSpeedMps);
  return estimated !== null && estimated !== currentType ? estimated : null;
}

export function modeChangeQuestion(suggested: ActivityType): string {
  return `${ACTIVITY_CONFIGS[suggested].label} 기록으로 바꿀까요?`;
}
