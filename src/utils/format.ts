import type { DistanceUnit } from '../types';

export const METERS_PER_MILE = 1609.344;

export function unitMeters(unit: DistanceUnit): number {
  return unit === 'km' ? 1000 : METERS_PER_MILE;
}

export function unitLabel(unit: DistanceUnit): string {
  return unit === 'km' ? 'km' : 'mi';
}

export function metersToUnit(m: number, unit: DistanceUnit): number {
  return m / unitMeters(unit);
}

export function unitToMeters(value: number, unit: DistanceUnit): number {
  return value * unitMeters(unit);
}

/** "5.23" (단위 미포함) */
export function formatDistanceValue(m: number, unit: DistanceUnit, digits = 2): string {
  return metersToUnit(m, unit).toFixed(digits);
}

/** "5.23 km" */
export function formatDistance(m: number, unit: DistanceUnit, digits = 2): string {
  return `${formatDistanceValue(m, unit, digits)} ${unitLabel(unit)}`;
}

/** 초 → "32:05" 또는 "1:02:03" */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

/** 속도(m/s) → 단위당 초. 정지 상태면 null. */
export function speedToPaceSec(speedMps: number, unit: DistanceUnit): number | null {
  if (!Number.isFinite(speedMps) || speedMps <= 0.05) return null;
  return unitMeters(unit) / speedMps;
}

export function paceSecToSpeed(paceSec: number, unit: DistanceUnit): number {
  return paceSec > 0 ? unitMeters(unit) / paceSec : 0;
}

/** 5'32" (단위 미포함). 30분/단위보다 느리면 의미 없는 값으로 보고 "--" */
export function formatPaceValue(speedMps: number, unit: DistanceUnit): string {
  const pace = speedToPaceSec(speedMps, unit);
  if (pace === null || pace > 60 * 60) return `-'--"`;
  let m = Math.floor(pace / 60);
  let s = Math.round(pace % 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}'${String(s).padStart(2, '0')}"`;
}

/** 5'32"/km */
export function formatPace(speedMps: number, unit: DistanceUnit): string {
  return `${formatPaceValue(speedMps, unit)}/${unitLabel(unit)}`;
}

export function speedToUnitPerHour(speedMps: number, unit: DistanceUnit): number {
  return (speedMps * 3600) / unitMeters(unit);
}

export function formatSpeedValue(speedMps: number, unit: DistanceUnit): string {
  return speedToUnitPerHour(Math.max(0, speedMps), unit).toFixed(1);
}

/** 24.5 km/h */
export function formatSpeed(speedMps: number, unit: DistanceUnit): string {
  return `${formatSpeedValue(speedMps, unit)} ${unit === 'km' ? 'km/h' : 'mph'}`;
}

/** 모드의 주요 지표 형식으로 속도를 표시한다. */
export function formatPrimary(speedMps: number, primary: 'pace' | 'speed', unit: DistanceUnit): string {
  return primary === 'pace' ? formatPace(speedMps, unit) : formatSpeed(speedMps, unit);
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('ko-KR');
}

export function formatElevation(m: number): string {
  return `${Math.round(m)} m`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026. 10. 16. (금) 오전 7:05 */
export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${formatDate(ts)} ${ampm} ${h12}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${WEEKDAYS[d.getDay()]})`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 음성 안내용 시간: "1시간 2분 3초" */
export function spokenDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}시간`);
  if (m > 0) parts.push(`${m}분`);
  if (s > 0 || parts.length === 0) parts.push(`${s}초`);
  return parts.join(' ');
}

/** 음성 안내용 페이스: "5분 32초" */
export function spokenPace(speedMps: number, unit: DistanceUnit): string {
  const pace = speedToPaceSec(speedMps, unit);
  if (pace === null) return '측정 불가';
  return spokenDuration(pace);
}

export function spokenDistance(m: number, unit: DistanceUnit): string {
  const v = metersToUnit(m, unit);
  const rounded = Math.round(v * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, '');
  return `${text}${unit === 'km' ? '킬로미터' : '마일'}`;
}

export function spokenSpeed(speedMps: number, unit: DistanceUnit): string {
  return `시속 ${formatSpeedValue(speedMps, unit)}${unit === 'km' ? '킬로미터' : '마일'}`;
}
