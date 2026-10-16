// MET 기반 칼로리 계산.
// kcal = MET × 체중(kg) × 시간(h). 체중 미입력 시 65kg으로 가정한다.

export const DEFAULT_WEIGHT_KG = 65;

/** [속도(km/h), MET] 기준점. 속도 오름차순이어야 한다. */
export type MetTable = readonly (readonly [number, number])[];

/**
 * 기준점 사이 속도는 선형 보간한다.
 * 표의 범위를 벗어나면 양 끝 값을 그대로 쓴다(과도한 외삽으로 칼로리가 튀는 것을 방지).
 */
export function interpolateMet(table: MetTable, speedKmh: number): number {
  if (table.length === 0) return 0;
  const first = table[0];
  const last = table[table.length - 1];
  if (speedKmh <= first[0]) return first[1];
  if (speedKmh >= last[0]) return last[1];
  for (let i = 1; i < table.length; i += 1) {
    const [s1, m1] = table[i];
    const [s0, m0] = table[i - 1];
    if (speedKmh <= s1) {
      const ratio = (speedKmh - s0) / (s1 - s0);
      return m0 + (m1 - m0) * ratio;
    }
  }
  return last[1];
}

export function calculateCalories(met: number, weightKg: number | null, durationSec: number): number {
  const weight = weightKg && weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG;
  const hours = durationSec / 3600;
  return Math.round(met * weight * hours);
}
