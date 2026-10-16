import { BADGES, badgeProgressList, findNewBadges, isBadgeEarned, parseBadges, type BadgeDefinition } from '../../src/features/gamification/badges';
import { CHALLENGES, monthlyChallengeProgress } from '../../src/features/gamification/challenges';
import { levelFromMinutes, minutesForLevel, modeDistanceLevel, overallLevel } from '../../src/features/gamification/levels';
import { goalProgress } from '../../src/features/gamification/goals';
import { computeWeeklyStreak } from '../../src/features/gamification/streak';
import { makeSummary } from '../helpers/fixtures';
import type { Goal } from '../../src/types';

const badge = (id: string): BadgeDefinition => {
  const b = BADGES.find((x) => x.id === id);
  if (!b) throw new Error(id);
  return b;
};

const NOW = new Date(2026, 9, 16, 12).getTime(); // 2026-10-16 금요일
const week = (n: number, hour = 9): number => new Date(2026, 9, 12 - n * 7, hour).getTime(); // n주 전 월요일

describe('주 단위 스트릭', () => {
  it('이번 주 포함 연속 주 수', () => {
    const s = computeWeeklyStreak([week(0), week(1), week(2), week(4)], NOW);
    expect(s).toEqual({ current: 3, longest: 3, activeThisWeek: true });
  });

  it('이번 주에 아직 활동이 없어도 지난주까지 이어졌다면 유지', () => {
    expect(computeWeeklyStreak([week(1), week(2)], NOW).current).toBe(2);
    expect(computeWeeklyStreak([week(2), week(3)], NOW).current).toBe(0);
  });

  it('모드와 관계없이 한 주에 여러 번이어도 1주', () => {
    expect(computeWeeklyStreak([week(0), week(0, 18), week(1)], NOW).current).toBe(2);
    expect(computeWeeklyStreak([], NOW)).toEqual({ current: 0, longest: 0, activeThisWeek: false });
  });
});

describe('레벨', () => {
  it('전체 레벨은 활동 시간 기준', () => {
    expect(minutesForLevel(1)).toBe(0);
    expect(minutesForLevel(2)).toBe(60);
    expect(levelFromMinutes(0).level).toBe(1);
    expect(levelFromMinutes(59).level).toBe(1);
    expect(levelFromMinutes(60).level).toBe(2);
    expect(levelFromMinutes(600).level).toBe(5);
    expect(levelFromMinutes(120).progress).toBeCloseTo(0.5);
  });

  it('같은 시간이면 자전거든 산책이든 같은 레벨', () => {
    const ride = [makeSummary({ type: 'ride', durationSec: 3600 * 3, distanceM: 90000 })];
    const walk = [makeSummary({ type: 'walk', durationSec: 3600 * 3, distanceM: 15000 })];
    expect(overallLevel(ride).level).toBe(overallLevel(walk).level);
  });

  it('모드별 거리 레벨: 달리기 100km, 자전거 500km 단위', () => {
    const list = [makeSummary({ type: 'run', distanceM: 150_000 }), makeSummary({ type: 'ride', distanceM: 450_000 })];
    expect(modeDistanceLevel(list, 'run')).toMatchObject({ level: 2, progress: 0.5 });
    expect(modeDistanceLevel(list, 'ride').level).toBe(1);
    expect(modeDistanceLevel(list, 'walk').level).toBe(1);
  });
});

describe('배지', () => {
  it('badges.json 검증', () => {
    expect(BADGES.length).toBeGreaterThanOrEqual(20);
    expect(() => parseBadges([{ id: 'x', name: '', description: '', icon: '', activityType: 'swim', condition: { kind: 'activityCount' } }])).toThrow();
    expect(() => parseBadges([{ id: 'x', name: '', description: '', icon: '', activityType: null, condition: { kind: 'nope' } }])).toThrow();
  });

  it('공통: 첫 활동, 새벽, 세 모드, 연속 주', () => {
    const early = makeSummary({ startedAt: new Date(2026, 9, 1, 5, 30).getTime() });
    expect(isBadgeEarned(badge('first-activity'), [early], NOW)).toBe(true);
    expect(isBadgeEarned(badge('early-bird'), [early], NOW)).toBe(true);
    expect(isBadgeEarned(badge('early-bird'), [makeSummary({ startedAt: new Date(2026, 9, 1, 6, 0).getTime() })], NOW)).toBe(false);
    const three = [makeSummary({ type: 'run' }), makeSummary({ type: 'walk' }), makeSummary({ type: 'ride' })];
    expect(isBadgeEarned(badge('all-modes'), three, NOW)).toBe(true);
    expect(isBadgeEarned(badge('all-modes'), three.slice(0, 2), NOW)).toBe(false);
    const fourWeeks = [0, 1, 2, 3].map((n) => makeSummary({ startedAt: week(n) }));
    expect(isBadgeEarned(badge('streak-4'), fourWeeks, NOW)).toBe(true);
    expect(isBadgeEarned(badge('streak-12'), fourWeeks, NOW)).toBe(false);
  });

  it('모드 조건: 자전거 10km는 달리기 10K 배지가 아니다', () => {
    const ride = makeSummary({ type: 'ride', distanceM: 12000 });
    expect(isBadgeEarned(badge('run-first-10k'), [ride], NOW)).toBe(false);
    expect(isBadgeEarned(badge('run-first-10k'), [makeSummary({ type: 'run', distanceM: 10000 })], NOW)).toBe(true);
    expect(isBadgeEarned(badge('run-first-10k'), [makeSummary({ type: 'run', distanceM: 10000, isIndoor: true })], NOW)).toBe(false);
    expect(isBadgeEarned(badge('run-total-100'), [makeSummary({ type: 'run', distanceM: 60000 }), makeSummary({ type: 'run', distanceM: 40000 })], NOW)).toBe(true);
  });

  it('산책 걸음 수, 자전거 상승 고도', () => {
    const d = new Date(2026, 9, 1, 8).getTime();
    const walks = [makeSummary({ type: 'walk', steps: 6000, startedAt: d }), makeSummary({ type: 'walk', steps: 4500, startedAt: d + 3600_000 })];
    expect(isBadgeEarned(badge('walk-10k-steps'), walks, NOW)).toBe(true);
    expect(isBadgeEarned(badge('walk-1m-steps'), walks, NOW)).toBe(false);
    const rides = [makeSummary({ type: 'ride', elevationGainM: 600 }), makeSummary({ type: 'ride', elevationGainM: 500 })];
    expect(isBadgeEarned(badge('ride-climb-1000'), rides, NOW)).toBe(true);
    expect(isBadgeEarned(badge('ride-everest'), rides, NOW)).toBe(false);
    expect(isBadgeEarned(badge('ride-first-50'), [makeSummary({ type: 'ride', distanceM: 50000 })], NOW)).toBe(true);
  });

  it('이미 받은 배지는 다시 주지 않는다', () => {
    const list = [makeSummary({ type: 'run', distanceM: 5000 })];
    const fresh = findNewBadges(list, [], NOW).map((b) => b.id);
    expect(fresh).toEqual(expect.arrayContaining(['first-activity', 'run-first-5k']));
    const again = findNewBadges(list, [{ id: '1', badgeId: 'first-activity', earnedAt: 0, activityId: null, createdAt: 0, updatedAt: 0 }], NOW).map((b) => b.id);
    expect(again).not.toContain('first-activity');
    expect(badgeProgressList([]).length).toBe(BADGES.length);
  });
});

describe('월간 챌린지', () => {
  it('이번 달 활동만 집계', () => {
    const list = [
      makeSummary({ type: 'run', distanceM: 60000, startedAt: new Date(2026, 9, 3).getTime() }),
      makeSummary({ type: 'run', distanceM: 50000, startedAt: new Date(2026, 9, 10).getTime() }),
      makeSummary({ type: 'run', distanceM: 50000, startedAt: new Date(2026, 8, 28).getTime() }),
      makeSummary({ type: 'walk', steps: 150000, startedAt: new Date(2026, 9, 5).getTime() }),
    ];
    const p = monthlyChallengeProgress(list, NOW);
    expect(p.find((c) => c.challenge.id === 'run-100k')).toMatchObject({ value: 110000, completed: true, progress: 1 });
    expect(p.find((c) => c.challenge.id === 'walk-300k-steps')?.progress).toBeCloseTo(0.5);
    expect(p.find((c) => c.challenge.id === 'any-20')?.value).toBe(3);
    expect(CHALLENGES.length).toBeGreaterThan(3);
  });
});

describe('목표 진행률', () => {
  const goal = (over: Partial<Goal>): Goal => ({ id: 'g', activityType: 'run', period: 'week', metric: 'distance', target: 20000, createdAt: 0, updatedAt: 0, ...over });

  it('모드별 주간 거리, 하루 걸음 수', () => {
    const list = [
      makeSummary({ type: 'run', distanceM: 5000, startedAt: new Date(2026, 9, 13, 7).getTime() }),
      makeSummary({ type: 'ride', distanceM: 30000, startedAt: new Date(2026, 9, 14, 7).getTime() }),
      makeSummary({ type: 'walk', steps: 6000, startedAt: new Date(2026, 9, 16, 7).getTime() }),
      makeSummary({ type: 'run', steps: 3000, distanceM: 5000, startedAt: new Date(2026, 9, 16, 9).getTime() }),
    ];
    expect(goalProgress(goal({}), list, NOW)).toMatchObject({ value: 10000, progress: 0.5 });
    expect(goalProgress(goal({ activityType: null, period: 'day', metric: 'steps', target: 10000 }), list, NOW).value).toBe(9000);
    expect(goalProgress(goal({ period: 'year', target: 0 }), list, NOW).progress).toBe(0);
  });
});
