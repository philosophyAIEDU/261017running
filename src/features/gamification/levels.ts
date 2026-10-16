import { ACTIVITY_CONFIGS } from '../activity/activityConfig';
import type { ActivitySummary, ActivityType } from '../../types';

// 전체 레벨은 활동 시간(분) 기준이다. 거리 기준이면 같은 시간에 몇 배 멀리 가는 자전거가 지나치게 유리하다.
// 레벨 L에 도달하는 데 필요한 누적 시간 = 30 × L × (L - 1) 분
//   (Lv2 = 1시간, Lv3 = 3시간, Lv5 = 10시간, Lv10 = 45시간, Lv20 = 190시간)

export const LEVEL_MINUTES_UNIT = 30;

export function minutesForLevel(level: number): number {
  return LEVEL_MINUTES_UNIT * level * (level - 1);
}

export interface LevelInfo {
  level: number;
  current: number; // 현재 누적 값
  levelStart: number; // 현재 레벨 시작 값
  nextLevelAt: number; // 다음 레벨 도달 값
  progress: number; // 0~1
}

export function levelFromMinutes(totalMinutes: number): LevelInfo {
  let level = 1;
  while (minutesForLevel(level + 1) <= totalMinutes) level += 1;
  const levelStart = minutesForLevel(level);
  const nextLevelAt = minutesForLevel(level + 1);
  return { level, current: totalMinutes, levelStart, nextLevelAt, progress: (totalMinutes - levelStart) / (nextLevelAt - levelStart) };
}

export function overallLevel(activities: ActivitySummary[]): LevelInfo {
  const minutes = activities.reduce((acc, a) => acc + a.durationSec, 0) / 60;
  return levelFromMinutes(minutes);
}

/** 모드별 거리 레벨: 설정의 levelDistanceKm마다 1레벨 (달리기·산책 100km, 자전거 500km) */
export function modeDistanceLevel(activities: ActivitySummary[], type: ActivityType): LevelInfo {
  const stepM = ACTIVITY_CONFIGS[type].levelDistanceKm * 1000;
  const total = activities.filter((a) => a.type === type).reduce((acc, a) => acc + a.distanceM, 0);
  const level = Math.floor(total / stepM) + 1;
  const levelStart = (level - 1) * stepM;
  return { level, current: total, levelStart, nextLevelAt: level * stepM, progress: (total - levelStart) / stepM };
}
