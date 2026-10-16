import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { parseGpx } from '../backup/gpx';
import type { ActivityConfig } from '../activity/activityConfig';
import type { LocationSource } from './locationSource';
import type { ActivityType, RawLocation } from '../../types';

// 개발 빌드용 GPS 시뮬레이션: 샘플 GPX(노이즈 포함)를 실제 시간 또는 가속(N배속)으로 재생한다.
// 실제로 움직이지 않고도 카운트다운 → 기록 → 자동 일시정지 → 스플릿/음성 안내 → 종료 흐름을 확인할 수 있다.

/* eslint-disable @typescript-eslint/no-require-imports */
const SAMPLE_ASSETS: Record<ActivityType, number> = {
  run: require('../../../assets/gpx/run.gpx') as number,
  walk: require('../../../assets/gpx/walk.gpx') as number,
  ride: require('../../../assets/gpx/ride.gpx') as number,
};
/* eslint-enable @typescript-eslint/no-require-imports */

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: (): number => Date.now() };

/** speed배 빠르게 흐르는 시계. 엔진의 시간도 이 시계를 써야 페이스가 원래 기록과 같게 나온다. */
export class AcceleratedClock implements Clock {
  private readonly wallStart = Date.now();

  constructor(
    private readonly simStart: number,
    private readonly speed: number,
  ) {}

  now(): number {
    return this.simStart + (Date.now() - this.wallStart) * this.speed;
  }
}

export async function loadSampleGpx(type: ActivityType): Promise<string> {
  const asset = Asset.fromModule(SAMPLE_ASSETS[type]);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('샘플 GPX를 불러올 수 없습니다.');
  return new File(asset.localUri).text();
}

/**
 * GPX 포인트를 시뮬레이션 시작 시각 기준으로 옮긴다.
 * 속도는 비워 두어(null) 엔진이 실제 기기에서 속도 값이 없을 때와 같은 방식(변위 기반)으로 판정하게 한다.
 */
export function prepareReplay(gpxText: string, simStart: number): RawLocation[] {
  const parsed = parseGpx(gpxText);
  if (parsed.points.length === 0) return [];
  const base = parsed.points[0].timestamp;
  return parsed.points.map((p) => ({
    timestamp: simStart + (p.timestamp - base),
    latitude: p.latitude,
    longitude: p.longitude,
    altitude: p.altitude,
    accuracy: p.accuracy,
    speed: null,
  }));
}

export class GpxReplaySource implements LocationSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private index = 0;
  private paused = false;

  constructor(
    private readonly locations: RawLocation[],
    private readonly clock: Clock,
  ) {}

  /** 수동 일시정지 동안에는 재생도 멈춰, 재개 시 이어서 움직이도록 한다. */
  setPaused(paused: boolean, offsetMs = 0): void {
    this.paused = paused;
    if (!paused && offsetMs > 0) {
      for (let i = this.index; i < this.locations.length; i += 1) {
        this.locations[i] = { ...this.locations[i], timestamp: this.locations[i].timestamp + offsetMs };
      }
    }
  }

  async start(_config: ActivityConfig, onLocations: (locations: RawLocation[]) => void): Promise<void> {
    this.timer = setInterval(() => {
      if (this.paused) return;
      const now = this.clock.now();
      const batch: RawLocation[] = [];
      while (this.index < this.locations.length && this.locations[this.index].timestamp <= now) {
        batch.push(this.locations[this.index]);
        this.index += 1;
      }
      if (batch.length > 0) onLocations(batch);
    }, 250);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get finished(): boolean {
    return this.index >= this.locations.length;
  }
}
