import { ACTIVITY_CONFIGS } from '../activity/activityConfig';
import { spokenDistance, spokenDuration, spokenPace, spokenSpeed } from '../../utils/format';
import type { ActivityType, DistanceUnit } from '../../types';

// 음성 안내 문구 생성(순수 함수). 실제 재생은 voiceCoach.ts에서 한다.

export function speedPhrase(type: ActivityType, speedMps: number, unit: DistanceUnit): string {
  return ACTIVITY_CONFIGS[type].primaryMetric === 'pace' ? `페이스 ${spokenPace(speedMps, unit)}` : spokenSpeed(speedMps, unit);
}

export function announceMessage(
  type: ActivityType,
  e: { distanceM: number; movingSec: number; segmentSpeedMps: number; avgSpeedMps: number },
  unit: DistanceUnit,
  extra?: { heartRate?: number | null },
): string {
  const parts = [
    spokenDistance(e.distanceM, unit),
    `시간 ${spokenDuration(e.movingSec)}`,
    `구간 ${speedPhrase(type, e.segmentSpeedMps, unit)}`,
    `평균 ${speedPhrase(type, e.avgSpeedMps, unit)}`,
  ];
  if (extra?.heartRate) parts.push(`심박 ${extra.heartRate}`);
  return `${parts.join('. ')}.`;
}

export function startMessage(type: ActivityType, isIndoor: boolean): string {
  const c = ACTIVITY_CONFIGS[type];
  return `${isIndoor ? c.indoorLabel : c.label} 기록을 시작합니다.`;
}

export const PAUSE_MESSAGE = '일시정지했습니다.';
export const RESUME_MESSAGE = '기록을 다시 시작합니다.';
export const AUTO_PAUSE_MESSAGE = '자동 일시정지.';
export const AUTO_RESUME_MESSAGE = '자동으로 다시 시작합니다.';

export function finishMessage(type: ActivityType, distanceM: number, movingSec: number, avgSpeedMps: number, unit: DistanceUnit): string {
  return `${ACTIVITY_CONFIGS[type].label} 종료. 총 ${spokenDistance(distanceM, unit)}, ${spokenDuration(movingSec)}. 평균 ${speedPhrase(type, avgSpeedMps, unit)}. 수고하셨습니다.`;
}

/** 자전거 모드 등에서 화면을 보지 않도록 요청 시 전체 상황을 읽어준다. */
export function statusMessage(type: ActivityType, distanceM: number, movingSec: number, currentSpeedMps: number, avgSpeedMps: number, unit: DistanceUnit): string {
  return `${spokenDistance(distanceM, unit)}. ${spokenDuration(movingSec)}. 현재 ${speedPhrase(type, currentSpeedMps, unit)}. 평균 ${speedPhrase(type, avgSpeedMps, unit)}.`;
}
