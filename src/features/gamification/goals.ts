import { periodRange } from '../analysis/stats';
import { addDays, startOfDay } from '../../utils/date';
import type { ActivitySummary, Goal, GoalPeriod } from '../../types';

export const PERIOD_LABELS: Record<GoalPeriod, string> = { day: '오늘', week: '이번 주', month: '이번 달', year: '올해' };

export interface GoalProgress {
  goal: Goal;
  value: number;
  progress: number; // 0~ (1 초과 가능)
  start: number;
  end: number;
}

/** 목표 기간(오늘/이번 주/이번 달/올해) 안의 해당 모드 활동으로 진행률을 계산한다. */
export function goalProgress(goal: Goal, activities: ActivitySummary[], now: number): GoalProgress {
  const range = goal.period === 'day' ? { start: startOfDay(now), end: addDays(startOfDay(now), 1) } : periodRange(goal.period, now);
  const list = activities.filter((a) => a.startedAt >= range.start && a.startedAt < range.end && (goal.activityType === null || a.type === goal.activityType));
  const value = goal.metric === 'distance' ? list.reduce((s, a) => s + a.distanceM, 0) : list.reduce((s, a) => s + (a.steps ?? 0), 0);
  return { goal, value, progress: goal.target > 0 ? value / goal.target : 0, start: range.start, end: range.end };
}
