import badgeData from '../../data/badges.json';
import { computeWeeklyStreak } from './streak';
import { ACTIVITY_TYPES, isActivityType } from '../activity/activityConfig';
import { dayKey } from '../../utils/date';
import type { ActivitySummary, ActivityType, EarnedBadge } from '../../types';

export type BadgeCondition =
  | { kind: 'activityCount'; min: number }
  | { kind: 'startedBeforeHour'; hour: number }
  | { kind: 'weeklyStreak'; weeks: number }
  | { kind: 'allModes' }
  | { kind: 'singleDistance'; meters: number }
  | { kind: 'totalDistance'; meters: number }
  | { kind: 'dailySteps'; steps: number }
  | { kind: 'totalSteps'; steps: number }
  | { kind: 'totalElevation'; meters: number };

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  activityType: ActivityType | null; // null = 모든 모드 공통
  condition: BadgeCondition;
}

interface RawBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  activityType: string | null;
  condition: { kind: string } & Record<string, unknown>;
}

const CONDITION_KINDS = ['activityCount', 'startedBeforeHour', 'weeklyStreak', 'allModes', 'singleDistance', 'totalDistance', 'dailySteps', 'totalSteps', 'totalElevation'];

/** JSON을 검증해 타입이 맞는 배지 정의만 돌려준다(잘못된 항목은 조용히 무시하지 않고 예외). */
export function parseBadges(raw: RawBadge[]): BadgeDefinition[] {
  return raw.map((b) => {
    if (b.activityType !== null && !isActivityType(b.activityType)) throw new Error(`배지 ${b.id}: 알 수 없는 activityType ${b.activityType}`);
    if (!CONDITION_KINDS.includes(b.condition.kind)) throw new Error(`배지 ${b.id}: 알 수 없는 조건 ${b.condition.kind}`);
    return { ...b, activityType: b.activityType as ActivityType | null, condition: b.condition as unknown as BadgeCondition };
  });
}

export const BADGES: BadgeDefinition[] = parseBadges(badgeData as RawBadge[]);

function scoped(list: ActivitySummary[], type: ActivityType | null): ActivitySummary[] {
  return type === null ? list : list.filter((a) => a.type === type);
}

/** 배지 조건 달성 여부. 모드 조건이 있으면 해당 모드 활동만 본다. */
export function isBadgeEarned(def: BadgeDefinition, all: ActivitySummary[], now: number): boolean {
  const list = scoped(all, def.activityType);
  const c = def.condition;
  switch (c.kind) {
    case 'activityCount':
      return list.length >= c.min;
    case 'startedBeforeHour':
      return list.some((a) => new Date(a.startedAt).getHours() < c.hour);
    case 'weeklyStreak': {
      const s = computeWeeklyStreak(list.map((a) => a.startedAt), now);
      return Math.max(s.current, s.longest) >= c.weeks;
    }
    case 'allModes':
      return ACTIVITY_TYPES.every((t) => all.some((a) => a.type === t));
    case 'singleDistance':
      return list.some((a) => !a.isIndoor && a.distanceM >= c.meters);
    case 'totalDistance':
      return list.reduce((acc, a) => acc + a.distanceM, 0) >= c.meters;
    case 'dailySteps': {
      const byDay = new Map<string, number>();
      for (const a of list) byDay.set(dayKey(a.startedAt), (byDay.get(dayKey(a.startedAt)) ?? 0) + (a.steps ?? 0));
      return [...byDay.values()].some((s) => s >= c.steps);
    }
    case 'totalSteps':
      return list.reduce((acc, a) => acc + (a.steps ?? 0), 0) >= c.steps;
    case 'totalElevation':
      return list.reduce((acc, a) => acc + a.elevationGainM, 0) >= c.meters;
  }
}

export interface BadgeProgress {
  badge: BadgeDefinition;
  earned: EarnedBadge | null;
}

/** 아직 받지 않은 배지 중 새로 달성한 배지 목록 */
export function findNewBadges(all: ActivitySummary[], earned: EarnedBadge[], now: number, definitions: BadgeDefinition[] = BADGES): BadgeDefinition[] {
  const have = new Set(earned.map((e) => e.badgeId));
  return definitions.filter((d) => !have.has(d.id) && isBadgeEarned(d, all, now));
}

export function badgeProgressList(earned: EarnedBadge[], definitions: BadgeDefinition[] = BADGES): BadgeProgress[] {
  return definitions.map((badge) => ({ badge, earned: earned.find((e) => e.badgeId === badge.id) ?? null }));
}
