import { ACTIVITY_CONFIGS } from '../activity/activityConfig';
import { dayKey } from '../../utils/date';
import type { Timeline } from '../../utils/geo';
import type { ActivitySummary, ActivityType, BestEffortKey, BestEfforts, PersonalRecord, PersonalRecordKey } from '../../types';

export const BEST_EFFORT_DISTANCES: Record<BestEffortKey, { meters: number; label: string }> = {
  '1k': { meters: 1000, label: '1K' },
  '5k': { meters: 5000, label: '5K' },
  '10k': { meters: 10000, label: '10K' },
  '20k': { meters: 20000, label: '20km' },
  '40k': { meters: 40000, label: '40km' },
  half: { meters: 21097.5, label: '하프' },
  full: { meters: 42195, label: '풀코스' },
  '100k': { meters: 100000, label: '100km' },
};

export const BEST_EFFORT_KEYS = Object.keys(BEST_EFFORT_DISTANCES) as BestEffortKey[];

/**
 * 활동 안에서 targetM 이상을 이동한 가장 빠른 구간의 시간(초)을 찾는다.
 *
 * 두 포인터(슬라이딩 윈도우):
 *  - 끝 포인터 j를 하나씩 늘리면서, 시작 포인터 i는 "i+1에서 시작해도 여전히 targetM 이상"인 동안 앞으로 민다.
 *  - 그러면 [i, j]는 끝이 j일 때 targetM 이상을 만족하는 가장 짧은 윈도우가 된다. (i는 단조 증가하므로 O(n))
 *  - 실제 시작 지점은 cum[j] - targetM 위치로, 포인트 i와 i+1 사이에 있다. 그 시각을 선형 보간해
 *    정확히 targetM 구간의 시간을 계산한다. (포인트 간격 때문에 생기는 과대 측정을 제거)
 */
export function findBestEffort(timeline: Timeline, targetM: number): number | null {
  const { cumDistanceM: cum, movingSec: t } = timeline;
  const n = cum.length;
  if (n < 2 || cum[n - 1] < targetM) return null;
  let best: number | null = null;
  let i = 0;
  for (let j = 1; j < n; j += 1) {
    if (cum[j] - cum[0] < targetM) continue;
    while (i + 1 < j && cum[j] - cum[i + 1] >= targetM) i += 1;
    const startD = cum[j] - targetM;
    const span = cum[i + 1] - cum[i];
    const ratio = span > 0 ? Math.min(1, Math.max(0, (startD - cum[i]) / span)) : 0;
    const startT = t[i] + (t[i + 1] - t[i]) * ratio;
    const elapsed = t[j] - startT;
    if (elapsed > 0 && (best === null || elapsed < best)) best = elapsed;
  }
  return best;
}

/**
 * 최고 속도(노이즈 필터 후 windowSec 평균).
 * 순간 속도는 GPS 튐에 민감하므로 windowSec(기본 5초) 이상 구간의 평균 속도 중 최댓값을 쓴다.
 * speedOverride가 있으면(자전거 속도 센서) 해당 값의 windowSec 이동 평균을 사용한다.
 */
export function findMaxAvgSpeed(timeline: Timeline, timestampsMs: number[], windowSec = 5, sensorSpeeds?: (number | null)[]): number {
  const { cumDistanceM: cum } = timeline;
  const n = cum.length;
  let best = 0;
  const hasSensor = sensorSpeeds !== undefined && sensorSpeeds.some((s) => s !== null);
  let i = 0;
  let sensorSum = 0;
  let sensorCount = 0;
  for (let j = 0; j < n; j += 1) {
    if (hasSensor) {
      const v = sensorSpeeds?.[j] ?? null;
      if (v !== null) {
        sensorSum += v;
        sensorCount += 1;
      }
    }
    while (i < j && (timestampsMs[j] - timestampsMs[i + 1]) / 1000 >= windowSec) {
      if (hasSensor) {
        const v = sensorSpeeds?.[i] ?? null;
        if (v !== null) {
          sensorSum -= v;
          sensorCount -= 1;
        }
      }
      i += 1;
    }
    const dt = (timestampsMs[j] - timestampsMs[i]) / 1000;
    if (dt < windowSec) continue;
    const speed = hasSensor ? (sensorCount > 0 ? sensorSum / sensorCount : 0) : (cum[j] - cum[i]) / dt;
    if (speed > best) best = speed;
  }
  return best;
}

/** 모든 표준 거리의 활동 내 최고 기록. 저장 시 한 번 계산해 두면 모드를 바꿔도 다시 GPS를 읽을 필요가 없다. */
export function computeBestEfforts(timeline: Timeline): BestEfforts {
  const result: BestEfforts = {};
  for (const key of BEST_EFFORT_KEYS) {
    const v = findBestEffort(timeline, BEST_EFFORT_DISTANCES[key].meters);
    if (v !== null) result[key] = Math.round(v * 10) / 10;
  }
  return result;
}

const EXTRA_LABELS: Record<Exclude<PersonalRecordKey, BestEffortKey>, string> = {
  longestDistance: '최장 거리',
  longestDuration: '최장 시간',
  mostDailySteps: '하루 최다 걸음 수',
  maxSpeed: '최고 속도',
  maxElevationGain: '최대 누적 상승',
};

function better(key: PersonalRecordKey, candidate: number, current: number | undefined): boolean {
  if (current === undefined) return true;
  return key in BEST_EFFORT_DISTANCES ? candidate < current : candidate > current;
}

/**
 * 모드별 PR 집계. 각 활동에 저장된 bestEfforts와 요약 값으로 계산하므로
 * 활동의 모드를 바꾸면 이 함수를 다시 호출하는 것만으로 PR이 재계산된다.
 */
export function computePersonalRecords(activities: ActivitySummary[], type: ActivityType): PersonalRecord[] {
  const config = ACTIVITY_CONFIGS[type];
  const list = activities.filter((a) => a.type === type);
  const records = new Map<PersonalRecordKey, PersonalRecord>();
  const put = (key: PersonalRecordKey, value: number, activityId: string | null, at: number, unit: PersonalRecord['unit']): void => {
    if (!(value > 0)) return;
    const cur = records.get(key);
    if (better(key, value, cur?.value)) {
      const label = key in BEST_EFFORT_DISTANCES ? BEST_EFFORT_DISTANCES[key as BestEffortKey].label : EXTRA_LABELS[key as Exclude<PersonalRecordKey, BestEffortKey>];
      records.set(key, { activityType: type, key, label, value, unit, activityId, achievedAt: at });
    }
  };
  for (const a of list) {
    if (!a.isIndoor) {
      for (const key of config.distancePrKeys) {
        const v = a.bestEfforts[key];
        if (v !== undefined) put(key, v, a.id, a.startedAt, 'sec');
      }
    }
    for (const key of config.extraPrKeys) {
      if (key === 'longestDistance') put(key, a.distanceM, a.id, a.startedAt, 'm');
      if (key === 'longestDuration') put(key, a.durationSec, a.id, a.startedAt, 'sec');
      if (key === 'maxSpeed' && !a.isIndoor) put(key, a.maxSpeed5sMps, a.id, a.startedAt, 'mps');
      if (key === 'maxElevationGain') put(key, a.elevationGainM, a.id, a.startedAt, 'm');
    }
  }
  if (config.extraPrKeys.includes('mostDailySteps')) {
    // 하루 최다 걸음 수는 같은 날의 해당 모드 활동 걸음 수를 합산한다.
    const byDay = new Map<string, { steps: number; at: number }>();
    for (const a of list) {
      if (a.steps === null) continue;
      const k = dayKey(a.startedAt);
      const cur = byDay.get(k) ?? { steps: 0, at: a.startedAt };
      byDay.set(k, { steps: cur.steps + a.steps, at: cur.at });
    }
    for (const { steps, at } of byDay.values()) put('mostDailySteps', steps, null, at, 'steps');
  }
  const order: PersonalRecordKey[] = [...config.distancePrKeys, ...config.extraPrKeys];
  return order.map((k) => records.get(k)).filter((r): r is PersonalRecord => r !== undefined);
}

/** 새 활동이 기존 기록을 경신했는지(같은 모드 기준). 활동 요약 화면/배지 알림용. */
export function newRecordsFor(activity: ActivitySummary, previous: ActivitySummary[]): PersonalRecord[] {
  const others = previous.filter((a) => a.id !== activity.id);
  const before = computePersonalRecords(others, activity.type);
  const after = computePersonalRecords([...others, activity], activity.type);
  return after.filter((r) => {
    const prev = before.find((b) => b.key === r.key);
    return r.activityId === activity.id && (prev === undefined || prev.value !== r.value);
  });
}
