import planData from '../../data/trainingPlans.json';
import { isActivityType } from '../activity/activityConfig';
import type { ActivityType, PlanProgress, WorkoutSettings } from '../../types';

export interface PlanWorkout {
  id: string;
  title: string;
  description: string;
  activityType: ActivityType;
  workout: Omit<WorkoutSettings, 'planWorkoutId'> | null;
}

export interface PlanWeek {
  week: number;
  workouts: PlanWorkout[];
}

export interface TrainingPlan {
  id: string;
  title: string;
  activityType: ActivityType;
  icon: string;
  level: string;
  description: string;
  weeks: PlanWeek[];
}

interface RawWorkout {
  id: string;
  title: string;
  description: string;
  activityType: string;
  workout?: { kind: string; target?: WorkoutSettings['target']; interval?: WorkoutSettings['interval'] };
}

function toWorkout(raw: RawWorkout): PlanWorkout {
  if (!isActivityType(raw.activityType)) throw new Error(`훈련 ${raw.id}: 잘못된 activityType`);
  const w = raw.workout;
  let workout: PlanWorkout['workout'] = null;
  if (w && (w.kind === 'target' || w.kind === 'interval' || w.kind === 'free')) {
    workout = { kind: w.kind, target: w.target ?? null, interval: w.interval ?? null };
  }
  return { id: raw.id, title: raw.title, description: raw.description, activityType: raw.activityType, workout };
}

export const TRAINING_PLANS: TrainingPlan[] = (
  planData as { id: string; title: string; activityType: string; icon: string; level: string; description: string; weeks: { week: number; workouts: RawWorkout[] }[] }[]
).map((p) => {
  if (!isActivityType(p.activityType)) throw new Error(`플랜 ${p.id}: 잘못된 activityType`);
  return { ...p, activityType: p.activityType, weeks: p.weeks.map((w) => ({ week: w.week, workouts: w.workouts.map(toWorkout) })) };
});

export function getPlan(id: string): TrainingPlan | undefined {
  return TRAINING_PLANS.find((p) => p.id === id);
}

export function allWorkouts(plan: TrainingPlan): PlanWorkout[] {
  return plan.weeks.flatMap((w) => w.workouts);
}

/** 오늘의 훈련: 완료하지 않은 첫 훈련 */
export function nextWorkout(plan: TrainingPlan, progress: PlanProgress): { workout: PlanWorkout; week: number; index: number } | null {
  let index = 0;
  for (const w of plan.weeks) {
    for (const wo of w.workouts) {
      if (!progress.completedWorkoutIds.includes(wo.id)) return { workout: wo, week: w.week, index };
      index += 1;
    }
  }
  return null;
}

export function planCompletion(plan: TrainingPlan, progress: PlanProgress): number {
  const total = allWorkouts(plan).length;
  return total === 0 ? 0 : progress.completedWorkoutIds.filter((id) => allWorkouts(plan).some((w) => w.id === id)).length / total;
}

export function toggleWorkoutComplete(progress: PlanProgress, workoutId: string, now: number): PlanProgress {
  const done = progress.completedWorkoutIds.includes(workoutId);
  return {
    ...progress,
    completedWorkoutIds: done ? progress.completedWorkoutIds.filter((id) => id !== workoutId) : [...progress.completedWorkoutIds, workoutId],
    updatedAt: now,
  };
}

/** 다음 훈련 알림 시각: 다음 날 오전 7시 */
export function nextReminderTime(now: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(7, 0, 0, 0);
  return d.getTime();
}
