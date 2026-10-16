// 로컬 시간대 기준 날짜 계산. 주는 월요일에 시작한다.

export const DAY_MS = 24 * 60 * 60 * 1000;

/** 이벤트 처리(저장 버튼 등) 시점의 현재 시각. 렌더링 중에는 useNow()를 쓴다. */
export function eventTime(): number {
  return Date.now();
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  const offset = (d.getDay() + 6) % 7; // 월=0 ... 일=6
  d.setDate(d.getDate() - offset);
  return d.getTime();
}

export function startOfMonth(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function startOfYear(ts: number): number {
  return new Date(new Date(ts).getFullYear(), 0, 1).getTime();
}

export function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function addMonths(ts: number, months: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + months, 1).getTime();
}

export function addYears(ts: number, years: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear() + years, 0, 1).getTime();
}

/** 날짜 키 "2026-10-16" */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysBetween(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);
}
