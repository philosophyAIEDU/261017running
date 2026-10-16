import { DEFAULT_STRIDE_M, estimateDistanceFromSteps, estimateStrideM } from '../../src/features/workouts/indoor';
import { buildPhases, detectTransition, phaseAnnouncement, phaseAt, totalIntervalSec } from '../../src/features/workouts/interval';
import { classifySpeed, evaluateTarget, initialTargetState } from '../../src/features/workouts/targetCoach';
import { TRAINING_PLANS, allWorkouts, getPlan, nextReminderTime, nextWorkout, planCompletion, toggleWorkoutComplete } from '../../src/features/workouts/trainingPlans';
import type { PlanProgress } from '../../src/types';

describe('인터벌', () => {
  const s = { warmupSec: 300, workSec: 60, recoverSec: 120, repeats: 3, cooldownSec: 300 };

  it('워밍업 → (고강도+회복)×N → 쿨다운', () => {
    const p = buildPhases(s);
    expect(p.map((x) => x.kind)).toEqual(['warmup', 'work', 'recover', 'work', 'recover', 'work', 'cooldown']);
    expect(totalIntervalSec(s)).toBe(300 + 60 * 3 + 120 * 2 + 300);
  });

  it('현재 구간, 남은 시간, 전환 감지', () => {
    const p = buildPhases(s);
    expect(phaseAt(p, 0).phase.kind).toBe('warmup');
    expect(phaseAt(p, 330)).toMatchObject({ phase: { kind: 'work', repeat: 1 }, remainingSec: 30 });
    expect(phaseAt(p, 10_000).phase.kind).toBe('done');
    expect(detectTransition(p, 299, 300)?.kind).toBe('work');
    expect(detectTransition(p, 301, 302)).toBeNull();
    expect(phaseAnnouncement(p[1], 3)).toContain('1번째 고강도');
    expect(phaseAnnouncement(phaseAt(p, 99999).phase, 3)).toContain('마쳤습니다');
  });

  it('쿨다운이 없으면 마지막 회복을 유지', () => {
    const p = buildPhases({ ...s, warmupSec: 0, cooldownSec: 0 });
    expect(p.map((x) => x.kind)).toEqual(['work', 'recover', 'work', 'recover', 'work', 'recover']);
  });
});

describe('목표 활동 코치', () => {
  it('±5% 범위 판정', () => {
    expect(classifySpeed(3.0, 3.0)).toBe('onTarget');
    expect(classifySpeed(2.8, 3.0)).toBe('tooSlow');
    expect(classifySpeed(3.2, 3.0)).toBe('tooFast');
  });

  it('20초 이상 벗어나면 알리고, 60초 동안 반복하지 않는다', () => {
    const target = { distanceM: null, durationSec: null, speedMps: 3 };
    let state = initialTargetState();
    const step = (sec: number, speed: number): string[] => {
      const r = evaluateTarget(target, state, { movingSec: sec, distanceM: sec * speed, currentSpeedMps: speed }, 'run', 'km');
      state = r.state;
      return r.messages;
    };
    expect(step(30, 2.5)).toEqual([]); // 워밍업 1분은 판정 안 함
    expect(step(70, 2.5)).toEqual([]);
    const m = step(90, 2.5);
    expect(m[0]).toContain('느립니다');
    expect(step(100, 2.5)).toEqual([]);
    expect(step(150, 2.5)).toHaveLength(1);
    expect(step(160, 3)).toEqual([]);
  });

  it('목표 거리·시간 달성 안내는 한 번만', () => {
    const target = { distanceM: 5000, durationSec: 1800, speedMps: null };
    const r1 = evaluateTarget(target, initialTargetState(), { movingSec: 1800, distanceM: 5000, currentSpeedMps: 3 }, 'ride', 'km');
    expect(r1.messages).toHaveLength(2);
    expect(evaluateTarget(target, r1.state, { movingSec: 1900, distanceM: 5200, currentSpeedMps: 3 }, 'ride', 'km').messages).toEqual([]);
  });

  it('자전거는 속도로 안내', () => {
    const target = { distanceM: null, durationSec: null, speedMps: 8 };
    let st = initialTargetState();
    st = evaluateTarget(target, st, { movingSec: 70, distanceM: 0, currentSpeedMps: 10 }, 'ride', 'km').state;
    const r = evaluateTarget(target, st, { movingSec: 95, distanceM: 0, currentSpeedMps: 10 }, 'ride', 'km');
    expect(r.messages[0]).toContain('속도가 목표보다 빠릅니다');
    expect(r.messages[0]).toContain('시속');
  });
});

describe('실내 모드', () => {
  it('보폭 = 키 × 0.415, 걸음 수로 거리 추정', () => {
    expect(estimateStrideM(170)).toBeCloseTo(0.7055);
    expect(estimateStrideM(null)).toBe(DEFAULT_STRIDE_M);
    expect(estimateStrideM(50)).toBe(DEFAULT_STRIDE_M);
    expect(estimateDistanceFromSteps(10000, null)).toBe(7000);
    expect(estimateDistanceFromSteps(null, 170)).toBe(0);
  });
});

describe('훈련 플랜', () => {
  const progress = (ids: string[]): PlanProgress => ({ id: 'p', planId: '5k-beginner', startedAt: 0, completedWorkoutIds: ids, active: true, createdAt: 0, updatedAt: 0 });

  it('플랜 데이터', () => {
    expect(TRAINING_PLANS.map((p) => p.id)).toEqual(['5k-beginner', '10k', 'half', 'full', 'walk-habit', 'ride-50k']);
    expect(getPlan('walk-habit')?.weeks).toHaveLength(4);
    expect(getPlan('ride-50k')?.weeks).toHaveLength(8);
    expect(getPlan('nope')).toBeUndefined();
  });

  it('오늘의 훈련, 완료 토글, 진행률', () => {
    const plan = getPlan('5k-beginner');
    if (!plan) throw new Error();
    const all = allWorkouts(plan);
    expect(nextWorkout(plan, progress([]))?.workout.id).toBe(all[0].id);
    let p = toggleWorkoutComplete(progress([]), all[0].id, 5);
    expect(nextWorkout(plan, p)?.workout.id).toBe(all[1].id);
    expect(planCompletion(plan, p)).toBeCloseTo(1 / all.length);
    p = toggleWorkoutComplete(p, all[0].id, 6);
    expect(p.completedWorkoutIds).toEqual([]);
    expect(nextWorkout(plan, progress(all.map((w) => w.id)))).toBeNull();
    expect(all[0].workout?.kind).toBe('interval');
  });

  it('다음 훈련 알림은 다음 날 오전 7시', () => {
    const t = nextReminderTime(new Date(2026, 9, 16, 20).getTime());
    expect(new Date(t).getDate()).toBe(17);
    expect(new Date(t).getHours()).toBe(7);
  });
});
