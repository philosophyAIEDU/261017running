import { addDays, addMonths, addYears, dayKey, startOfDay, startOfMonth, startOfWeek, startOfYear } from '../../utils/date';
import type { ActivitySummary, ActivityType } from '../../types';

export type StatsPeriod = 'week' | 'month' | 'year';

export interface Totals {
  count: number;
  distanceM: number;
  durationSec: number;
  elevationGainM: number;
  steps: number;
  calories: number;
}

export interface StatsBucket {
  label: string;
  start: number;
  totals: Totals;
}

export interface PeriodStats {
  start: number;
  end: number;
  totals: Totals;
  buckets: StatsBucket[]; // 주=요일별, 월=일별, 연=월별
  previousYear: Totals; // 전년 동기 대비
}

export function emptyTotals(): Totals {
  return { count: 0, distanceM: 0, durationSec: 0, elevationGainM: 0, steps: 0, calories: 0 };
}

export function sumTotals(list: ActivitySummary[]): Totals {
  const t = emptyTotals();
  for (const a of list) {
    t.count += 1;
    t.distanceM += a.distanceM;
    t.durationSec += a.durationSec;
    t.elevationGainM += a.elevationGainM;
    t.steps += a.steps ?? 0;
    t.calories += a.calories;
  }
  return t;
}

export function filterByType(list: ActivitySummary[], type: ActivityType | null): ActivitySummary[] {
  return type === null ? list : list.filter((a) => a.type === type);
}

export function inRange(list: ActivitySummary[], start: number, end: number): ActivitySummary[] {
  return list.filter((a) => a.startedAt >= start && a.startedAt < end);
}

export function periodRange(period: StatsPeriod, ref: number): { start: number; end: number } {
  if (period === 'week') {
    const start = startOfWeek(ref);
    return { start, end: addDays(start, 7) };
  }
  if (period === 'month') {
    const start = startOfMonth(ref);
    return { start, end: addMonths(start, 1) };
  }
  const start = startOfYear(ref);
  return { start, end: addYears(start, 1) };
}

const WEEK_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

/** 기간(주/월/연) 통계. type이 null이면 전체 모드 합산. */
export function computePeriodStats(all: ActivitySummary[], period: StatsPeriod, ref: number, type: ActivityType | null): PeriodStats {
  const list = filterByType(all, type);
  const { start, end } = periodRange(period, ref);
  const current = inRange(list, start, end);
  const buckets: StatsBucket[] = [];
  if (period === 'week') {
    for (let i = 0; i < 7; i += 1) {
      const s = addDays(start, i);
      buckets.push({ label: WEEK_LABELS[i], start: s, totals: sumTotals(inRange(current, s, addDays(s, 1))) });
    }
  } else if (period === 'month') {
    for (let s = start; s < end; s = addDays(s, 1)) {
      buckets.push({ label: String(new Date(s).getDate()), start: s, totals: sumTotals(inRange(current, s, addDays(s, 1))) });
    }
  } else {
    for (let m = 0; m < 12; m += 1) {
      const s = addMonths(start, m);
      buckets.push({ label: `${m + 1}월`, start: s, totals: sumTotals(inRange(current, s, addMonths(s, 1))) });
    }
  }
  // 전년 동기: 1년 전 같은 기간 중 "오늘에 해당하는 시점"까지만 비교해 공정하게 맞춘다.
  const prevStart = new Date(start);
  prevStart.setFullYear(prevStart.getFullYear() - 1);
  const elapsed = Math.min(ref, end) - start;
  const prevEnd = prevStart.getTime() + Math.max(elapsed, 0) + 1;
  const previousYear = sumTotals(inRange(list, prevStart.getTime(), prevEnd));
  return { start, end, totals: sumTotals(current), buckets, previousYear };
}

/** 캘린더 히트맵: 날짜 키 → 그날 활동한 모드 목록, 총 거리 */
export interface HeatmapDay {
  key: string;
  date: number;
  types: ActivityType[];
  distanceM: number;
}

export function buildHeatmap(all: ActivitySummary[], start: number, days: number): HeatmapDay[] {
  const map = new Map<string, HeatmapDay>();
  for (let i = 0; i < days; i += 1) {
    const d = addDays(startOfDay(start), i);
    map.set(dayKey(d), { key: dayKey(d), date: d, types: [], distanceM: 0 });
  }
  for (const a of all) {
    const entry = map.get(dayKey(a.startedAt));
    if (!entry) continue;
    if (!entry.types.includes(a.type)) entry.types.push(a.type);
    entry.distanceM += a.distanceM;
  }
  return [...map.values()];
}

export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
