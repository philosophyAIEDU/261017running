import challengeData from '../../data/challenges.json';
import { isActivityType } from '../activity/activityConfig';
import { addMonths, startOfMonth } from '../../utils/date';
import type { ActivitySummary, ActivityType } from '../../types';

export type ChallengeMetric = 'distance' | 'steps' | 'count' | 'duration' | 'elevation';

export interface ChallengeDefinition {
  id: string;
  title: string;
  icon: string;
  activityType: ActivityType | null;
  metric: ChallengeMetric;
  target: number;
}

export interface ChallengeProgress {
  challenge: ChallengeDefinition;
  value: number;
  progress: number; // 0~1
  completed: boolean;
}

const METRICS: ChallengeMetric[] = ['distance', 'steps', 'count', 'duration', 'elevation'];

export const CHALLENGES: ChallengeDefinition[] = (challengeData as (Omit<ChallengeDefinition, 'activityType' | 'metric'> & { activityType: string | null; metric: string })[]).map((c) => {
  if (c.activityType !== null && !isActivityType(c.activityType)) throw new Error(`챌린지 ${c.id}: 잘못된 activityType`);
  if (!METRICS.includes(c.metric as ChallengeMetric)) throw new Error(`챌린지 ${c.id}: 잘못된 metric`);
  return { ...c, activityType: c.activityType as ActivityType | null, metric: c.metric as ChallengeMetric };
});

export function metricValue(list: ActivitySummary[], metric: ChallengeMetric): number {
  switch (metric) {
    case 'distance':
      return list.reduce((a, x) => a + x.distanceM, 0);
    case 'steps':
      return list.reduce((a, x) => a + (x.steps ?? 0), 0);
    case 'count':
      return list.length;
    case 'duration':
      return list.reduce((a, x) => a + x.durationSec, 0);
    case 'elevation':
      return list.reduce((a, x) => a + x.elevationGainM, 0);
  }
}

/** 이번 달(로컬) 챌린지 진행률 */
export function monthlyChallengeProgress(all: ActivitySummary[], now: number, definitions: ChallengeDefinition[] = CHALLENGES): ChallengeProgress[] {
  const start = startOfMonth(now);
  const end = addMonths(start, 1);
  const month = all.filter((a) => a.startedAt >= start && a.startedAt < end);
  return definitions.map((challenge) => {
    const list = challenge.activityType === null ? month : month.filter((a) => a.type === challenge.activityType);
    const value = metricValue(list, challenge.metric);
    return { challenge, value, progress: Math.min(1, value / challenge.target), completed: value >= challenge.target };
  });
}
