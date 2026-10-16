import { ACTIVITY_CONFIGS } from '../activity/activityConfig';
import { computeSplits } from '../analysis/splits';
import { computeBestEfforts, findMaxAvgSpeed } from '../analysis/personalRecords';
import { averageCadence } from '../analysis/series';
import { computeHrZones } from '../sensors/heartRateZones';
import { calculateCalories } from '../../utils/calories';
import { buildTimeline, computeElevation } from '../../utils/geo';
import type { Activity, ActivityDetails, ActivityType, PauseInterval, StepSample, TrackPoint, WorkoutSettings } from '../../types';

export interface BuildInput {
  id: string;
  type: ActivityType;
  startedAt: number;
  endedAt: number;
  points: TrackPoint[];
  pauses: PauseInterval[];
  steps: number | null;
  stepSamples: StepSample[];
  workout: WorkoutSettings;
  source: ActivityDetails['source'];
  weightKg: number | null;
  maxHeartRate: number | null;
  gearId: string | null;
  isIndoor: boolean;
  /** 실내 모드에서 사용자가 입력하거나 걸음 수로 추정한 거리 */
  manualDistanceM?: number | null;
  now: number;
}

export function totalPausedMs(pauses: PauseInterval[], endedAt: number): number {
  return pauses.reduce((acc, p) => acc + Math.max(0, Math.min(p.end, endedAt) - p.start), 0);
}

export function defaultTitle(type: ActivityType, startedAt: number, isIndoor: boolean): string {
  const h = new Date(startedAt).getHours();
  const part = h < 6 ? '새벽' : h < 11 ? '아침' : h < 14 ? '점심' : h < 18 ? '오후' : h < 21 ? '저녁' : '밤';
  const c = ACTIVITY_CONFIGS[type];
  return `${part} ${isIndoor ? c.indoorLabel : c.label}`;
}

/**
 * 포인트와 일시정지 목록으로 활동 레코드 전체를 계산한다.
 * 기록 종료, GPX 가져오기, 저장 후 모드 변경(스플릿·칼로리 재계산)에서 공통으로 사용한다.
 */
export function buildActivity(input: BuildInput, existing?: Pick<Activity, 'title' | 'note' | 'perceivedEffort' | 'createdAt'>): Activity {
  const config = ACTIVITY_CONFIGS[input.type];
  const durationSec = Math.max(0, Math.round((input.endedAt - input.startedAt - totalPausedMs(input.pauses, input.endedAt)) / 1000));
  const timeline = buildTimeline(input.points, input.pauses, input.startedAt);
  const gpsDistance = timeline.cumDistanceM.length > 0 ? timeline.cumDistanceM[timeline.cumDistanceM.length - 1] : 0;
  const distanceM = input.isIndoor ? Math.max(0, input.manualDistanceM ?? 0) : gpsDistance;
  const avgSpeedMps = durationSec > 0 ? distanceM / durationSec : 0;
  const elevation = input.isIndoor ? { gain: 0, loss: 0 } : computeElevation(input.points);
  const sensorSpeeds = input.points.map((p) => p.sensorSpeedMps);
  const maxSpeed5s = input.isIndoor ? 0 : findMaxAvgSpeed(timeline, input.points.map((p) => p.timestamp), 5, sensorSpeeds);
  const hr = input.points.map((p) => p.heartRate).filter((h): h is number => h !== null);
  const cad = input.points.map((p) => p.cadence).filter((c): c is number => c !== null && c > 0);
  const met = config.metByIntensity(avgSpeedMps);
  const avgCadence =
    input.type === 'ride'
      ? cad.length > 0
        ? Math.round(cad.reduce((a, b) => a + b, 0) / cad.length)
        : null
      : averageCadence(input.steps, durationSec);
  const details: ActivityDetails = {
    workout: input.workout,
    pauses: input.pauses,
    splits: input.isIndoor ? [] : computeSplits(input.points, input.pauses, config.splitEveryKm * 1000, timeline),
    bestEfforts: input.isIndoor ? {} : computeBestEfforts(timeline),
    maxSpeed5sMps: maxSpeed5s,
    elevationLossM: Math.round(elevation.loss),
    avgHeartRate: hr.length > 0 ? Math.round(hr.reduce((a, b) => a + b, 0) / hr.length) : null,
    maxHeartRate: hr.length > 0 ? Math.max(...hr) : null,
    hrZonesSec: input.maxHeartRate ? computeHrZones(input.points, input.pauses, input.maxHeartRate) : null,
    avgCadence,
    stepSamples: input.stepSamples,
    source: input.source,
    healthSynced: false,
  };
  return {
    id: input.id,
    type: input.type,
    startedAt: input.startedAt,
    durationSec,
    distanceM,
    avgSpeedMps,
    maxSpeedMps: maxSpeed5s,
    elevationGainM: Math.round(elevation.gain),
    steps: input.steps,
    calories: calculateCalories(met, input.weightKg, durationSec),
    isIndoor: input.isIndoor,
    gearId: input.gearId,
    title: existing?.title ?? defaultTitle(input.type, input.startedAt, input.isIndoor),
    note: existing?.note ?? '',
    perceivedEffort: existing?.perceivedEffort ?? null,
    details,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
  };
}

/**
 * 저장된 활동의 모드를 바꾼다. 스플릿 간격, 칼로리(MET)가 모드에 따라 달라지므로 포인트로 다시 계산한다.
 * PR은 활동에 저장된 bestEfforts를 모드별로 집계하므로 별도 처리 없이 자동 반영된다.
 */
export function changeActivityType(activity: Activity, points: TrackPoint[], newType: ActivityType, weightKg: number | null, maxHeartRate: number | null, now: number): Activity {
  const endedAt = activity.startedAt + activity.durationSec * 1000 + totalPausedMs(activity.details.pauses, Number.MAX_SAFE_INTEGER);
  const rebuilt = buildActivity(
    {
      id: activity.id,
      type: newType,
      startedAt: activity.startedAt,
      endedAt,
      points,
      pauses: activity.details.pauses,
      steps: activity.steps,
      stepSamples: activity.details.stepSamples,
      workout: activity.details.workout,
      source: activity.details.source,
      weightKg,
      maxHeartRate,
      gearId: activity.gearId,
      isIndoor: activity.isIndoor,
      manualDistanceM: activity.isIndoor ? activity.distanceM : null,
      now,
    },
    activity,
  );
  const oldDefault = defaultTitle(activity.type, activity.startedAt, activity.isIndoor);
  return {
    ...rebuilt,
    title: activity.title === oldDefault ? defaultTitle(newType, activity.startedAt, activity.isIndoor) : activity.title,
    details: { ...rebuilt.details, healthSynced: activity.details.healthSynced },
  };
}
