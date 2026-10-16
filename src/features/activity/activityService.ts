import { changeActivityType } from '../tracking/activityBuilder';
import { newRecordsFor } from '../analysis/personalRecords';
import { effortResult, matchSegment } from '../analysis/segments';
import { buildTimeline } from '../../utils/geo';
import { findNewBadges, type BadgeDefinition } from '../gamification/badges';
import { newId } from '../../utils/id';
import type { Repositories } from '../../db/repositories/types';
import type { Activity, ActivitySummary, ActivityType, PersonalRecord, Segment, SegmentEffort, TrackPoint } from '../../types';

// 활동 저장/수정/삭제 시 따라오는 후처리(구간 매칭, 배지, PR)를 한곳에 모은다.

export function toSummary(a: Activity): ActivitySummary {
  const { details, ...rest } = a;
  return { ...rest, bestEfforts: details.bestEfforts, maxSpeed5sMps: details.maxSpeed5sMps };
}

export interface SegmentResult {
  segment: Segment;
  effort: SegmentEffort;
  rank: number;
  total: number;
  isBest: boolean;
}

export interface SaveOutcome {
  newRecords: PersonalRecord[];
  newBadges: BadgeDefinition[];
  segmentResults: SegmentResult[];
}

/** 활동 경로를 모든 내 구간과 매칭해 기록을 만든다(같은 활동의 이전 기록은 교체). */
export async function matchSegmentsForActivity(repos: Repositories, activity: Activity, points: TrackPoint[], now: number): Promise<SegmentResult[]> {
  if (activity.isIndoor || points.length < 2) return [];
  const segments = await repos.segments.list();
  const timeline = buildTimeline(points, activity.details.pauses, activity.startedAt);
  const efforts: { segment: Segment; effort: SegmentEffort }[] = [];
  for (const segment of segments) {
    for (const m of matchSegment(points, segment, activity.details.pauses, timeline)) {
      efforts.push({
        segment,
        effort: {
          id: newId(),
          segmentId: segment.id,
          activityId: activity.id,
          activityType: activity.type,
          startedAt: m.startedAt,
          elapsedSec: Math.round(m.elapsedSec * 10) / 10,
          distanceM: m.distanceM,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  }
  await repos.segments.deleteEffortsForActivity(activity.id);
  await repos.segments.saveEfforts(efforts.map((e) => e.effort));
  const all = await repos.segments.listEfforts();
  return efforts.map(({ segment, effort }) => ({ segment, effort, ...effortResult(effort, all) }));
}

export async function awardNewBadges(repos: Repositories, activityId: string | null, now: number): Promise<BadgeDefinition[]> {
  const [summaries, earned] = await Promise.all([repos.activities.listSummaries(), repos.badges.list()]);
  const fresh = findNewBadges(summaries, earned, now);
  for (const b of fresh) {
    await repos.badges.award({ id: newId(), badgeId: b.id, earnedAt: now, activityId, createdAt: now, updatedAt: now });
  }
  return fresh;
}

export async function saveActivity(repos: Repositories, activity: Activity, points: TrackPoint[], now: number = Date.now()): Promise<SaveOutcome> {
  const previous = await repos.activities.listSummaries({ type: activity.type });
  await repos.activities.save(activity, points);
  const newRecords = newRecordsFor(toSummary(activity), previous);
  const segmentResults = await matchSegmentsForActivity(repos, activity, points, now);
  const newBadges = await awardNewBadges(repos, activity.id, now);
  return { newRecords, newBadges, segmentResults };
}

/** 저장 후 모드 변경: 스플릿·칼로리 재계산, 구간 기록의 모드도 함께 바꾼다(PR은 집계 시 자동 반영). */
export async function changeSavedActivityType(
  repos: Repositories,
  activity: Activity,
  newType: ActivityType,
  weightKg: number | null,
  maxHeartRate: number | null,
  now: number = Date.now(),
): Promise<Activity> {
  const points = await repos.activities.getTrackPoints(activity.id);
  const updated = changeActivityType(activity, points, newType, weightKg, maxHeartRate, now);
  await repos.activities.update(updated);
  const efforts = await repos.segments.listEffortsForActivity(activity.id);
  if (efforts.length > 0) {
    await repos.segments.saveEfforts(efforts.map((e) => ({ ...e, activityType: newType, updatedAt: now })));
  }
  await awardNewBadges(repos, activity.id, now);
  return updated;
}
