import { spokenDuration } from '../../utils/format';
import type { IntervalSettings } from '../../types';

// 인터벌 운동: 워밍업 → (고강도 N분 + 회복 M분) × 반복 → 쿨다운.
// 이동 시간(일시정지 제외)을 기준으로 현재 구간을 계산하므로 일시정지해도 구간이 밀리지 않는다.

export type IntervalPhaseKind = 'warmup' | 'work' | 'recover' | 'cooldown' | 'done';

export interface IntervalPhase {
  kind: IntervalPhaseKind;
  index: number; // 전체 구간 순번(0부터)
  repeat: number; // 몇 번째 반복인지(1부터, work/recover만 의미)
  startSec: number;
  durationSec: number;
}

export const PHASE_LABELS: Record<IntervalPhaseKind, string> = {
  warmup: '워밍업',
  work: '고강도',
  recover: '회복',
  cooldown: '쿨다운',
  done: '완료',
};

export function buildPhases(s: IntervalSettings): IntervalPhase[] {
  const phases: IntervalPhase[] = [];
  let t = 0;
  const push = (kind: IntervalPhaseKind, durationSec: number, repeat: number): void => {
    if (durationSec <= 0) return;
    phases.push({ kind, index: phases.length, repeat, startSec: t, durationSec });
    t += durationSec;
  };
  push('warmup', s.warmupSec, 0);
  for (let r = 1; r <= s.repeats; r += 1) {
    push('work', s.workSec, r);
    // 마지막 반복 뒤 회복은 쿨다운이 대신한다(쿨다운이 없으면 회복 유지)
    if (r < s.repeats || s.cooldownSec <= 0) push('recover', s.recoverSec, r);
  }
  push('cooldown', s.cooldownSec, 0);
  return phases;
}

export function totalIntervalSec(s: IntervalSettings): number {
  return buildPhases(s).reduce((acc, p) => acc + p.durationSec, 0);
}

export interface PhaseStatus {
  phase: IntervalPhase;
  remainingSec: number;
}

export function phaseAt(phases: IntervalPhase[], movingSec: number): PhaseStatus {
  for (const p of phases) {
    if (movingSec < p.startSec + p.durationSec) {
      return { phase: p, remainingSec: p.startSec + p.durationSec - movingSec };
    }
  }
  const total = phases.length > 0 ? phases[phases.length - 1].startSec + phases[phases.length - 1].durationSec : 0;
  return { phase: { kind: 'done', index: phases.length, repeat: 0, startSec: total, durationSec: 0 }, remainingSec: 0 };
}

export function phaseAnnouncement(p: IntervalPhase, repeats: number): string {
  switch (p.kind) {
    case 'warmup':
      return `워밍업 ${spokenDuration(p.durationSec)} 시작.`;
    case 'work':
      return `${p.repeat}번째 고강도 구간 시작! ${spokenDuration(p.durationSec)}. 총 ${repeats}회 중 ${p.repeat}회.`;
    case 'recover':
      return `회복 구간. ${spokenDuration(p.durationSec)} 동안 천천히.`;
    case 'cooldown':
      return `쿨다운 ${spokenDuration(p.durationSec)} 시작. 수고하셨습니다.`;
    case 'done':
      return '인터벌 운동을 모두 마쳤습니다.';
  }
}

/** 이전 시각과 현재 시각 사이에 구간이 바뀌었으면 새 구간을 돌려준다. */
export function detectTransition(phases: IntervalPhase[], prevSec: number, nowSec: number): IntervalPhase | null {
  const a = phaseAt(phases, prevSec).phase;
  const b = phaseAt(phases, nowSec).phase;
  return a.index !== b.index ? b : null;
}
