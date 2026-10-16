import { ACTIVITY_CONFIGS } from '../activity/activityConfig';
import { estimateActivityType } from '../activity/modeDetection';
import { buildActivity } from '../tracking/activityBuilder';
import { parseGpx } from './gpx';
import { filterLocations, totalDistance } from '../../utils/geo';
import type { Activity, ActivityType, TrackPoint } from '../../types';

export interface GpxImportPreview {
  name: string | null;
  points: number;
  distanceM: number;
  durationSec: number;
  avgSpeedMps: number;
  suggestedType: ActivityType | null; // 평균 속도로 추정한 모드
  typeHint: ActivityType | null; // 파일의 <type> 태그
}

/** 가져오기 전 미리보기: 평균 속도로 모드를 추정해 제안한다. */
export function previewGpx(xml: string): GpxImportPreview {
  const parsed = parseGpx(xml);
  const pts = parsed.points;
  // 모드를 모르므로 가장 관대한 기준(자전거)으로만 튐을 걸러 평균 속도를 구한다.
  const filtered = filterLocations(pts, ACTIVITY_CONFIGS.ride.filter);
  const distanceM = totalDistance(filtered);
  const durationSec = filtered.length > 1 ? (filtered[filtered.length - 1].timestamp - filtered[0].timestamp) / 1000 : 0;
  const avg = durationSec > 0 ? distanceM / durationSec : 0;
  return { name: parsed.name, points: pts.length, distanceM, durationSec, avgSpeedMps: avg, suggestedType: estimateActivityType(avg), typeHint: parsed.typeHint };
}

/** 선택한 모드로 GPX를 활동 레코드로 변환한다(모드의 노이즈 필터 적용). */
export function gpxToActivity(xml: string, type: ActivityType, id: string, weightKg: number | null, maxHeartRate: number | null, now: number): { activity: Activity; points: TrackPoint[] } {
  const parsed = parseGpx(xml);
  const kept = filterLocations(parsed.points, ACTIVITY_CONFIGS[type].filter);
  if (kept.length < 2) throw new Error('유효한 GPS 포인트가 부족합니다.');
  const points: TrackPoint[] = kept.map((p) => {
    const src = parsed.points.find((q) => q.timestamp === p.timestamp);
    return {
      activityId: id,
      timestamp: p.timestamp,
      latitude: p.latitude,
      longitude: p.longitude,
      altitude: p.altitude,
      accuracy: p.accuracy ?? 5,
      heartRate: src?.heartRate ?? null,
      cadence: src?.cadence ?? null,
      sensorSpeedMps: null,
    };
  });
  const activity = buildActivity({
    id,
    type,
    startedAt: points[0].timestamp,
    endedAt: points[points.length - 1].timestamp,
    points,
    pauses: [],
    steps: null,
    stepSamples: [],
    workout: { kind: 'free', target: null, interval: null, planWorkoutId: null },
    source: 'gpx',
    weightKg,
    maxHeartRate,
    gearId: null,
    isIndoor: false,
    now,
  });
  return { activity: parsed.name ? { ...activity, title: parsed.name } : activity, points };
}
