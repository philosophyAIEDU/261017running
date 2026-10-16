import { speedPhrase } from '../tracking/voiceMessages';
import { spokenDistance, spokenDuration } from '../../utils/format';
import type { ActivityType, DistanceUnit, TargetSettings } from '../../types';

// 목표 활동 코치.
// 목표 페이스(속도) ± tolerance 범위를 벗어난 상태가 OFF_TARGET_CONFIRM_SEC 동안 계속되면 음성으로 알린다.
// 한 번 알린 뒤에는 COOLDOWN_SEC 동안 같은 안내를 반복하지 않는다(잔소리 방지).

export const TARGET_TOLERANCE = 0.05;
export const OFF_TARGET_CONFIRM_SEC = 20;
export const COOLDOWN_SEC = 60;
const WARMUP_SEC = 60; // 처음 1분은 속도가 안정되지 않으므로 판정하지 않는다

export type TargetState = 'onTarget' | 'tooSlow' | 'tooFast';

export interface TargetCoachState {
  offSince: number | null;
  offState: TargetState;
  lastAlertAt: number | null;
  distanceReached: boolean;
  durationReached: boolean;
}

export function initialTargetState(): TargetCoachState {
  return { offSince: null, offState: 'onTarget', lastAlertAt: null, distanceReached: false, durationReached: false };
}

export function classifySpeed(currentMps: number, targetMps: number, tolerance = TARGET_TOLERANCE): TargetState {
  if (currentMps < targetMps * (1 - tolerance)) return 'tooSlow';
  if (currentMps > targetMps * (1 + tolerance)) return 'tooFast';
  return 'onTarget';
}

export interface TargetInput {
  movingSec: number;
  distanceM: number;
  currentSpeedMps: number;
}

/** 상태를 갱신하고 말해야 할 문장들을 돌려준다(순수 함수). */
export function evaluateTarget(
  target: TargetSettings,
  state: TargetCoachState,
  input: TargetInput,
  type: ActivityType,
  unit: DistanceUnit,
): { state: TargetCoachState; messages: string[] } {
  const next = { ...state };
  const messages: string[] = [];
  if (target.distanceM && !next.distanceReached && input.distanceM >= target.distanceM) {
    next.distanceReached = true;
    messages.push(`목표 거리 ${spokenDistance(target.distanceM, unit)}를 달성했습니다!`);
  }
  if (target.durationSec && !next.durationReached && input.movingSec >= target.durationSec) {
    next.durationReached = true;
    messages.push(`목표 시간 ${spokenDuration(target.durationSec)}를 달성했습니다!`);
  }
  if (target.speedMps && input.movingSec >= WARMUP_SEC) {
    const cls = classifySpeed(input.currentSpeedMps, target.speedMps);
    if (cls === 'onTarget') {
      next.offSince = null;
      next.offState = 'onTarget';
    } else {
      if (next.offState !== cls) {
        next.offState = cls;
        next.offSince = input.movingSec;
      }
      const offFor = input.movingSec - (next.offSince ?? input.movingSec);
      const cooled = next.lastAlertAt === null || input.movingSec - next.lastAlertAt >= COOLDOWN_SEC;
      if (offFor >= OFF_TARGET_CONFIRM_SEC && cooled) {
        next.lastAlertAt = input.movingSec;
        const word = type === 'ride' ? (cls === 'tooSlow' ? '속도가 목표보다 느립니다' : '속도가 목표보다 빠릅니다') : cls === 'tooSlow' ? '페이스가 목표보다 느립니다' : '페이스가 목표보다 빠릅니다';
        messages.push(`${word}. 현재 ${speedPhrase(type, input.currentSpeedMps, unit)}, 목표 ${speedPhrase(type, target.speedMps, unit)}.`);
      }
    }
  }
  return { state: next, messages };
}
