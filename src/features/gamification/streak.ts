import { addDays, startOfWeek } from '../../utils/date';

export interface StreakInfo {
  current: number; // 현재 연속 주 수
  longest: number;
  activeThisWeek: boolean;
}

/**
 * 주 단위 연속 기록(월요일 시작, 로컬 시간).
 * - 모드와 관계없이 그 주에 활동이 하나라도 있으면 해당 주는 "유지"다.
 * - 이번 주에 아직 활동이 없어도 지난주까지 이어졌다면 이번 주가 끝나기 전까지는 끊기지 않은 것으로 본다.
 */
export function computeWeeklyStreak(activityStarts: number[], now: number = Date.now()): StreakInfo {
  const weeks = new Set(activityStarts.map((t) => startOfWeek(t)));
  const thisWeek = startOfWeek(now);
  const activeThisWeek = weeks.has(thisWeek);
  let current = 0;
  let cursor = activeThisWeek ? thisWeek : startOfWeek(addDays(thisWeek, -7));
  while (weeks.has(cursor)) {
    current += 1;
    cursor = startOfWeek(addDays(cursor, -7));
  }
  const sorted = [...weeks].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const w of sorted) {
    run = prev !== null && startOfWeek(addDays(prev, 7)) === w ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = w;
  }
  return { current, longest, activeThisWeek };
}
