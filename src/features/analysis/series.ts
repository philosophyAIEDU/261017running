import { buildTimeline, smoothAltitudes, type Timeline } from '../../utils/geo';
import type { LatLng, PauseInterval, StepSample, TrackPoint } from '../../types';

export interface SeriesPoint {
  x: number; // 거리(m) 또는 시간(초)
  y: number;
}

/**
 * 거리 기준 속도 시계열. 포인트 간 순간 속도는 흔들리므로
 * windowSec 동안의 이동 평균 속도를 bucketM 간격으로 샘플링한다.
 */
export function speedSeries(timeline: Timeline, windowSec = 15, bucketM = 100): SeriesPoint[] {
  const { cumDistanceM: cum, movingSec: t } = timeline;
  const out: SeriesPoint[] = [];
  let i = 0;
  let nextBucket = bucketM;
  for (let j = 1; j < cum.length; j += 1) {
    while (i < j - 1 && t[j] - t[i + 1] >= windowSec) i += 1;
    if (cum[j] < nextBucket) continue;
    const dt = t[j] - t[i];
    if (dt > 0) out.push({ x: cum[j], y: (cum[j] - cum[i]) / dt });
    while (nextBucket <= cum[j]) nextBucket += bucketM;
  }
  return out;
}

export function elevationSeries(points: Pick<TrackPoint, 'altitude'>[], timeline: Timeline, bucketM = 100): SeriesPoint[] {
  const smoothed = smoothAltitudes(points.map((p) => p.altitude));
  const out: SeriesPoint[] = [];
  let nextBucket = 0;
  for (let i = 0; i < smoothed.length; i += 1) {
    const alt = smoothed[i];
    if (alt === null || timeline.cumDistanceM[i] < nextBucket) continue;
    out.push({ x: timeline.cumDistanceM[i], y: alt });
    while (nextBucket <= timeline.cumDistanceM[i]) nextBucket += bucketM;
  }
  return out;
}

export function heartRateSeries(points: Pick<TrackPoint, 'heartRate'>[], timeline: Timeline, bucketSec = 30): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  let next = 0;
  points.forEach((p, i) => {
    if (p.heartRate === null || timeline.movingSec[i] < next) return;
    out.push({ x: timeline.movingSec[i], y: p.heartRate });
    while (next <= timeline.movingSec[i]) next += bucketSec;
  });
  return out;
}

/** 시간대(분 단위 bucket)별 걸음 수. 산책 분석과 달리기 케이던스에 사용한다. */
export function stepsPerBucket(samples: StepSample[], startedAt: number, pauses: PauseInterval[], bucketMin = 5): SeriesPoint[] {
  if (samples.length === 0) return [];
  const buckets = new Map<number, number>();
  let prev = { timestamp: startedAt, steps: 0 };
  for (const s of samples) {
    const delta = Math.max(0, s.steps - prev.steps);
    const pausedBefore = pauses.reduce((acc, p) => acc + Math.max(0, Math.min(p.end, s.timestamp) - p.start), 0);
    const minute = Math.max(0, (s.timestamp - startedAt - pausedBefore) / 60000);
    const bucket = Math.floor(minute / bucketMin) * bucketMin;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + delta);
    prev = s;
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([x, y]) => ({ x, y }));
}

/** 케이던스(spm) 시계열: 분당 걸음 수 */
export function cadenceSeries(samples: StepSample[], startedAt: number, pauses: PauseInterval[]): SeriesPoint[] {
  return stepsPerBucket(samples, startedAt, pauses, 1).map((p) => ({ x: p.x, y: p.y }));
}

export function averageCadence(steps: number | null, durationSec: number): number | null {
  if (steps === null || durationSec <= 0) return null;
  return Math.round(steps / (durationSec / 60));
}

export interface ColoredPath {
  color: string;
  coordinates: LatLng[];
}

export const SPEED_COLORS = ['#D7263D', '#F46036', '#F9C80E', '#8BC34A', '#1B998B'];

/**
 * 경로를 속도 구간별 색으로 나눈다(느림=빨강 → 빠름=초록).
 * 활동 내 속도 분포의 분위수로 5단계를 나누므로, 모드와 관계없이 상대적인 빠르기가 드러난다.
 * 달리기·산책은 페이스, 자전거는 속도 기준이지만 둘 다 속도(m/s)의 단조 변환이므로 같은 구간이 된다.
 */
export function colorizeRoute(points: Pick<TrackPoint, 'timestamp' | 'latitude' | 'longitude'>[], pauses: PauseInterval[], colors: string[] = SPEED_COLORS): ColoredPath[] {
  if (points.length < 2) return [];
  const tl = buildTimeline(points, pauses);
  const speeds: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    // 5포인트 이동 평균 속도
    const k = Math.max(0, i - 5);
    const dt = tl.movingSec[i] - tl.movingSec[k];
    speeds.push(dt > 0 ? (tl.cumDistanceM[i] - tl.cumDistanceM[k]) / dt : 0);
  }
  const sorted = speeds.slice(1).sort((a, b) => a - b);
  const thresholds = colors.slice(1).map((_, idx) => sorted[Math.floor(((idx + 1) / colors.length) * (sorted.length - 1))]);
  const bucketOf = (s: number): number => {
    let b = 0;
    while (b < thresholds.length && s > thresholds[b]) b += 1;
    return b;
  };
  const paths: ColoredPath[] = [];
  let current: ColoredPath | null = null;
  for (let i = 1; i < points.length; i += 1) {
    const color = colors[bucketOf(speeds[i])];
    const a = { latitude: points[i - 1].latitude, longitude: points[i - 1].longitude };
    const b = { latitude: points[i].latitude, longitude: points[i].longitude };
    if (current && current.color === color) {
      current.coordinates.push(b);
    } else {
      current = { color, coordinates: [a, b] };
      paths.push(current);
    }
  }
  return paths;
}

export function timelineFor(points: Pick<TrackPoint, 'timestamp' | 'latitude' | 'longitude'>[], pauses: PauseInterval[], startedAt?: number): Timeline {
  return buildTimeline(points, pauses, startedAt);
}
