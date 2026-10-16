// 실내 모드: GPS 없이 시간만 기록하고, 종료 후 거리를 직접 입력한다.
// 산책 실내 모드는 걸음 수 × 보폭으로 거리를 추정한다.

export const DEFAULT_STRIDE_M = 0.7;

/** 걷기 보폭 추정: 키(cm) × 0.415. 키를 모르면 0.7m */
export function estimateStrideM(heightCm: number | null): number {
  if (!heightCm || heightCm < 100 || heightCm > 230) return DEFAULT_STRIDE_M;
  return (heightCm * 0.415) / 100;
}

export function estimateDistanceFromSteps(steps: number | null, heightCm: number | null): number {
  if (!steps || steps <= 0) return 0;
  return Math.round(steps * estimateStrideM(heightCm));
}
