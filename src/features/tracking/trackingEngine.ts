import { AutoPauseDetector } from './autoPause';
import { ACTIVITY_CONFIGS, type ActivityConfig } from '../activity/activityConfig';
import { calculateCalories } from '../../utils/calories';
import { ELEVATION_THRESHOLD_M, checkLocation, haversineDistance, type RejectReason } from '../../utils/geo';
import type { ActivityType, LatLng, PauseInterval, RawLocation, StepSample, TrackPoint } from '../../types';

// 세 모드가 공유하는 하나의 트래킹 엔진.
// 시간(now)은 항상 외부에서 주입받는 순수 로직이라 GPS·타이머 없이 단위 테스트할 수 있고,
// 시뮬레이션 모드에서는 가속된 시계를 넣어 재생할 수 있다.

export type TrackingStatus = 'idle' | 'running' | 'paused' | 'autoPaused' | 'finished';

export const CURRENT_SPEED_WINDOW_SEC = 15;
export const MAX_SPEED_WINDOW_SEC = 5;
const STEP_SAMPLE_INTERVAL_MS = 30_000;
const SENSOR_STALE_MS = 5_000;
const LIVE_ALTITUDE_WINDOW = 5;
const OBSERVED_SPEED_WINDOW_MS = 5_000;

export type EngineEvent =
  | { type: 'announce'; distanceM: number; movingSec: number; segmentSpeedMps: number; avgSpeedMps: number }
  | { type: 'split'; index: number; distanceM: number; durationSec: number; avgSpeedMps: number }
  | { type: 'autoPaused'; at: number }
  | { type: 'autoResumed'; at: number }
  | { type: 'rejected'; reason: RejectReason };

export interface EngineOptions {
  activityId: string;
  type: ActivityType;
  autoPauseEnabled: boolean;
  weightKg: number | null;
  isIndoor: boolean;
}

export interface EngineSnapshot {
  status: TrackingStatus;
  type: ActivityType;
  startedAt: number | null;
  movingSec: number;
  distanceM: number;
  currentSpeedMps: number;
  avgSpeedMps: number;
  maxSpeedMps: number;
  elevationGainM: number;
  steps: number | null;
  heartRate: number | null;
  cadence: number | null;
  calories: number;
  lastLocation: LatLng | null;
  pointCount: number;
}

export interface EngineState {
  options: EngineOptions;
  status: TrackingStatus;
  startedAt: number | null;
  endedAt: number | null;
  pauses: PauseInterval[];
  openPauseStart: number | null;
  distanceM: number;
  maxSpeedMps: number;
  elevationGainM: number;
  liveAltRef: number | null;
  breakPending: boolean;
  nextAnnounceM: number;
  lastAnnounce: { distanceM: number; movingSec: number };
  nextSplitM: number;
  lastSplit: { distanceM: number; movingSec: number };
  splitIndex: number;
  steps: number | null;
  stepSamples: StepSample[];
  heartRate: { value: number; at: number } | null;
  cadence: { value: number; at: number } | null;
  sensorSpeed: { value: number; at: number } | null;
  lastLocation: RawLocation | null;
  autoPause: { slowSince: number | null; paused: boolean; fastCount: number };
}

export class TrackingEngine {
  readonly config: ActivityConfig;
  private state: EngineState;
  private points: TrackPoint[] = [];
  private cum: number[] = [];
  private moving: number[] = [];
  private altitudes: number[] = [];
  private unsavedFrom = 0;
  private detector: AutoPauseDetector;
  private recentSeen: RawLocation[] = [];

  constructor(options: EngineOptions) {
    this.config = ACTIVITY_CONFIGS[options.type];
    this.detector = new AutoPauseDetector(this.config.autoPause);
    const announceM = this.config.announceEveryKm * 1000;
    const splitM = this.config.splitEveryKm * 1000;
    this.state = {
      options,
      status: 'idle',
      startedAt: null,
      endedAt: null,
      pauses: [],
      openPauseStart: null,
      distanceM: 0,
      maxSpeedMps: 0,
      elevationGainM: 0,
      liveAltRef: null,
      breakPending: false,
      nextAnnounceM: announceM,
      lastAnnounce: { distanceM: 0, movingSec: 0 },
      nextSplitM: splitM,
      lastSplit: { distanceM: 0, movingSec: 0 },
      splitIndex: 1,
      steps: null,
      stepSamples: [],
      heartRate: null,
      cadence: null,
      sensorSpeed: null,
      lastLocation: null,
      autoPause: this.detector.serialize(),
    };
  }

  get status(): TrackingStatus {
    return this.state.status;
  }

  get options(): EngineOptions {
    return this.state.options;
  }

  get startedAt(): number | null {
    return this.state.startedAt;
  }

  get pauses(): PauseInterval[] {
    return this.state.pauses;
  }

  get stepSamples(): StepSample[] {
    return this.state.stepSamples;
  }

  get steps(): number | null {
    return this.state.steps;
  }

  getPoints(): TrackPoint[] {
    return this.points;
  }

  start(now: number): void {
    if (this.state.status !== 'idle') return;
    this.state.status = 'running';
    this.state.startedAt = now;
  }

  pause(now: number): void {
    if (this.state.status === 'running') {
      this.state.openPauseStart = now;
    }
    if (this.state.status === 'running' || this.state.status === 'autoPaused') {
      // 자동 일시정지 중 수동 일시정지를 누르면 기존 일시정지 구간을 이어서 사용한다.
      this.state.status = 'paused';
      this.detector.reset();
    }
  }

  resume(now: number): void {
    if (this.state.status !== 'paused' && this.state.status !== 'autoPaused') return;
    this.closePause(now);
    this.state.status = 'running';
    this.detector.reset();
  }

  private closePause(now: number): void {
    if (this.state.openPauseStart !== null) {
      this.state.pauses.push({ start: this.state.openPauseStart, end: now });
      this.state.openPauseStart = null;
      this.state.breakPending = true;
    }
  }

  /** 일시정지를 제외한 이동 시간(초) */
  movingSecAt(now: number): number {
    const { startedAt, pauses, openPauseStart, endedAt } = this.state;
    if (startedAt === null) return 0;
    const end = endedAt ?? now;
    let paused = 0;
    for (const p of pauses) paused += Math.max(0, Math.min(p.end, end) - p.start);
    if (openPauseStart !== null) paused += Math.max(0, end - openPauseStart);
    return Math.max(0, (end - startedAt - paused) / 1000);
  }

  addLocations(locations: RawLocation[]): EngineEvent[] {
    const events: EngineEvent[] = [];
    for (const loc of locations) events.push(...this.addLocation(loc));
    return events;
  }

  addLocation(loc: RawLocation): EngineEvent[] {
    const s = this.state;
    if (s.status === 'idle' || s.status === 'finished' || s.options.isIndoor) return [];
    if (s.startedAt !== null && loc.timestamp < s.startedAt) return [];
    const events: EngineEvent[] = [];
    const last = this.points.length > 0 ? this.points[this.points.length - 1] : null;
    // 재개 직후에는 일시정지 전 포인트와 비교하지 않는다(쉬는 동안 이동했을 수 있음).
    const reject = checkLocation(loc, s.status === 'running' && !s.breakPending ? last : null, this.config.filter);
    if (reject !== null) {
      // 일시정지 중에는 직전 포인트와 비교하지 않지만, 정확도 기준은 동일하게 적용한다.
      return [{ type: 'rejected', reason: reject }];
    }
    s.lastLocation = loc;
    this.recentSeen.push(loc);
    while (this.recentSeen.length > 2 && loc.timestamp - this.recentSeen[1].timestamp >= OBSERVED_SPEED_WINDOW_MS) this.recentSeen.shift();

    if (s.status === 'paused') return events;

    // 자동 일시정지 판정용 속도: 센서 속도 → 기기 제공 속도 → 최근 위치 변위로 계산한 속도
    const observedSpeed = this.observedSpeed(loc);
    if (s.options.autoPauseEnabled) {
      const ev = this.detector.update(observedSpeed, loc.timestamp);
      if (ev?.type === 'pause') {
        s.status = 'autoPaused';
        s.openPauseStart = Math.max(ev.since, this.lastResumeAt());
        events.push({ type: 'autoPaused', at: loc.timestamp });
        return events;
      }
      if (ev?.type === 'resume') {
        this.closePause(loc.timestamp);
        s.status = 'running';
        events.push({ type: 'autoResumed', at: loc.timestamp });
      }
    }
    if (s.status === 'autoPaused') return events;

    this.acceptPoint(loc, events);
    return events;
  }

  private lastResumeAt(): number {
    const p = this.state.pauses;
    return p.length > 0 ? p[p.length - 1].end : (this.state.startedAt ?? 0);
  }

  /**
   * 기기가 속도를 주지 않으면 위치 변화로 속도를 추정한다.
   * 연속한 두 포인트로 계산하면 제자리에서도 GPS 흔들림(1~2m)이 매초 1~2m/s로 보여 자동 일시정지가 걸리지 않는다.
   * 그래서 약 5초 전 위치부터의 "변위"를 쓴다. 제자리 흔들림은 상쇄되고 실제 이동만 남는다.
   */
  private observedSpeed(loc: RawLocation): number {
    const sensor = this.freshSensorSpeed(loc.timestamp);
    if (sensor !== null) return sensor;
    if (loc.speed !== null && loc.speed >= 0) return loc.speed;
    const oldest = this.recentSeen[0];
    if (oldest && loc.timestamp > oldest.timestamp) {
      return haversineDistance(oldest, loc) / ((loc.timestamp - oldest.timestamp) / 1000);
    }
    return this.config.autoPause.speedBelowMps * 2; // 첫 포인트는 움직이는 중으로 본다
  }

  private freshSensorSpeed(now: number): number | null {
    const ss = this.state.sensorSpeed;
    return ss && now - ss.at <= SENSOR_STALE_MS ? ss.value : null;
  }

  private acceptPoint(loc: RawLocation, events: EngineEvent[]): void {
    const s = this.state;
    const prev = this.points.length > 0 ? this.points[this.points.length - 1] : null;
    const prevCum = this.cum.length > 0 ? this.cum[this.cum.length - 1] : 0;
    const prevMoving = this.moving.length > 0 ? this.moving[this.moving.length - 1] : 0;
    const add = prev && !s.breakPending ? haversineDistance(prev, loc) : 0;
    s.breakPending = false;
    const cum = prevCum + add;
    const movingNow = Math.max(prevMoving, this.movingSecAt(loc.timestamp));
    const hr = s.heartRate && loc.timestamp - s.heartRate.at <= SENSOR_STALE_MS ? s.heartRate.value : null;
    const cad = s.cadence && loc.timestamp - s.cadence.at <= SENSOR_STALE_MS ? s.cadence.value : null;
    const point: TrackPoint = {
      activityId: s.options.activityId,
      timestamp: loc.timestamp,
      latitude: loc.latitude,
      longitude: loc.longitude,
      altitude: loc.altitude,
      accuracy: loc.accuracy ?? 0,
      heartRate: hr,
      cadence: cad,
      sensorSpeedMps: this.freshSensorSpeed(loc.timestamp),
    };
    this.points.push(point);
    this.cum.push(cum);
    this.moving.push(movingNow);
    s.distanceM = cum;
    this.updateLiveElevation(loc.altitude);
    this.updateMaxSpeed();
    this.checkMilestones(prevCum, prevMoving, cum, movingNow, events);
  }

  /**
   * 실시간 누적 상승 고도: 최근 5개 고도의 후행 이동 평균을 쓰고, 기준 대비 3m 이상 변할 때만 반영한다.
   * (종료 후에는 중심 이동 평균으로 다시 계산해 저장한다)
   */
  private updateLiveElevation(altitude: number | null): void {
    if (altitude === null) return;
    this.altitudes.push(altitude);
    const recent = this.altitudes.slice(-LIVE_ALTITUDE_WINDOW);
    const smooth = recent.reduce((a, b) => a + b, 0) / recent.length;
    const s = this.state;
    if (s.liveAltRef === null) {
      s.liveAltRef = smooth;
      return;
    }
    const diff = smooth - s.liveAltRef;
    if (diff >= ELEVATION_THRESHOLD_M) {
      s.elevationGainM += diff;
      s.liveAltRef = smooth;
    } else if (diff <= -ELEVATION_THRESHOLD_M) {
      s.liveAltRef = smooth;
    }
  }

  /** 최고 속도는 5초 이상 구간의 평균 속도로 계산해 순간 튐을 무시한다. */
  private updateMaxSpeed(): void {
    const n = this.points.length;
    const sensor = this.points[n - 1].sensorSpeedMps;
    if (sensor !== null) {
      let sum = 0;
      let count = 0;
      for (let i = n - 1; i >= 0; i -= 1) {
        const v = this.points[i].sensorSpeedMps;
        if (v === null) break;
        sum += v;
        count += 1;
        if ((this.points[n - 1].timestamp - this.points[i].timestamp) / 1000 >= MAX_SPEED_WINDOW_SEC) {
          if (sum / count > this.state.maxSpeedMps) this.state.maxSpeedMps = sum / count;
          return;
        }
      }
      return;
    }
    for (let i = n - 2; i >= 0; i -= 1) {
      const dt = (this.points[n - 1].timestamp - this.points[i].timestamp) / 1000;
      if (dt >= MAX_SPEED_WINDOW_SEC) {
        const dMoving = this.moving[n - 1] - this.moving[i];
        if (dMoving >= MAX_SPEED_WINDOW_SEC) {
          const v = (this.cum[n - 1] - this.cum[i]) / dMoving;
          if (v > this.state.maxSpeedMps) this.state.maxSpeedMps = v;
        }
        return;
      }
    }
  }

  /** 음성 안내/스플릿 경계 통과 감지. 통과 시각은 두 포인트 사이 선형 보간으로 구한다. */
  private checkMilestones(prevCum: number, prevMoving: number, cum: number, moving: number, events: EngineEvent[]): void {
    const s = this.state;
    const interp = (d: number): number => (cum > prevCum ? prevMoving + ((moving - prevMoving) * (d - prevCum)) / (cum - prevCum) : moving);
    while (cum >= s.nextAnnounceM) {
      const at = interp(s.nextAnnounceM);
      const segD = s.nextAnnounceM - s.lastAnnounce.distanceM;
      const segT = at - s.lastAnnounce.movingSec;
      events.push({
        type: 'announce',
        distanceM: s.nextAnnounceM,
        movingSec: at,
        segmentSpeedMps: segT > 0 ? segD / segT : 0,
        avgSpeedMps: at > 0 ? s.nextAnnounceM / at : 0,
      });
      s.lastAnnounce = { distanceM: s.nextAnnounceM, movingSec: at };
      s.nextAnnounceM += this.config.announceEveryKm * 1000;
    }
    while (cum >= s.nextSplitM) {
      const at = interp(s.nextSplitM);
      const segD = s.nextSplitM - s.lastSplit.distanceM;
      const segT = at - s.lastSplit.movingSec;
      events.push({ type: 'split', index: s.splitIndex, distanceM: segD, durationSec: segT, avgSpeedMps: segT > 0 ? segD / segT : 0 });
      s.lastSplit = { distanceM: s.nextSplitM, movingSec: at };
      s.splitIndex += 1;
      s.nextSplitM += this.config.splitEveryKm * 1000;
    }
  }

  /**
   * 주기적(1초) 호출. 정지해 있으면 distanceInterval 때문에 위치 이벤트가 오지 않으므로
   * 마지막 위치 이후 시간이 흐른 것만으로도 자동 일시정지를 판정한다.
   */
  tick(now: number): EngineEvent[] {
    const s = this.state;
    if (s.status !== 'running' || !s.options.autoPauseEnabled || s.options.isIndoor) return [];
    const lastTs = s.lastLocation?.timestamp ?? s.startedAt ?? now;
    const gapSec = (now - lastTs) / 1000;
    const expectedGap = Math.max(this.config.gps.timeIntervalMs / 1000, this.config.gps.distanceIntervalM / Math.max(this.config.autoPause.speedBelowMps, 0.1));
    if (gapSec > expectedGap) this.detector.markStill(lastTs);
    const ev = this.detector.tick(now);
    if (ev?.type === 'pause') {
      s.status = 'autoPaused';
      s.openPauseStart = Math.max(ev.since, this.lastResumeAt());
      return [{ type: 'autoPaused', at: now }];
    }
    return [];
  }

  setSteps(totalSteps: number, now: number): void {
    const s = this.state;
    s.steps = totalSteps;
    const lastSample = s.stepSamples.length > 0 ? s.stepSamples[s.stepSamples.length - 1] : null;
    if (!lastSample || now - lastSample.timestamp >= STEP_SAMPLE_INTERVAL_MS) {
      s.stepSamples.push({ timestamp: now, steps: totalSteps });
    }
  }

  setHeartRate(bpm: number, now: number): void {
    this.state.heartRate = { value: bpm, at: now };
  }

  setCadence(value: number, now: number): void {
    this.state.cadence = { value, at: now };
  }

  setSensorSpeed(speedMps: number, now: number): void {
    this.state.sensorSpeed = { value: speedMps, at: now };
  }

  /** 현재 속도: 최근 15초 이동 평균(센서가 있으면 센서 속도 우선) */
  currentSpeed(now: number): number {
    const s = this.state;
    if (s.status !== 'running') return 0;
    const sensor = this.freshSensorSpeed(now);
    if (sensor !== null) return sensor;
    const n = this.points.length;
    if (n < 2) return 0;
    if ((now - this.points[n - 1].timestamp) / 1000 > CURRENT_SPEED_WINDOW_SEC) return 0;
    let i = n - 1;
    while (i > 0 && this.moving[n - 1] - this.moving[i - 1] <= CURRENT_SPEED_WINDOW_SEC) i -= 1;
    const dt = this.moving[n - 1] - this.moving[i];
    return dt > 0 ? (this.cum[n - 1] - this.cum[i]) / dt : 0;
  }

  snapshot(now: number): EngineSnapshot {
    const s = this.state;
    const movingSec = this.movingSecAt(now);
    const avg = movingSec > 0 ? s.distanceM / movingSec : 0;
    const hr = s.heartRate && now - s.heartRate.at <= SENSOR_STALE_MS ? s.heartRate.value : null;
    const cad = s.cadence && now - s.cadence.at <= SENSOR_STALE_MS ? s.cadence.value : null;
    return {
      status: s.status,
      type: s.options.type,
      startedAt: s.startedAt,
      movingSec,
      distanceM: s.distanceM,
      currentSpeedMps: this.currentSpeed(now),
      avgSpeedMps: avg,
      maxSpeedMps: s.maxSpeedMps,
      elevationGainM: s.elevationGainM,
      steps: s.steps,
      heartRate: hr,
      cadence: cad,
      calories: calculateCalories(this.config.metByIntensity(avg), s.options.weightKg, movingSec),
      lastLocation: s.lastLocation ? { latitude: s.lastLocation.latitude, longitude: s.lastLocation.longitude } : null,
      pointCount: this.points.length,
    };
  }

  finish(now: number): void {
    const s = this.state;
    if (s.status === 'idle' || s.status === 'finished') return;
    if (s.openPauseStart !== null) {
      s.pauses.push({ start: s.openPauseStart, end: now });
      s.openPauseStart = null;
    }
    s.status = 'finished';
    s.endedAt = now;
  }

  get endedAt(): number | null {
    return this.state.endedAt;
  }

  /** 크래시 복구용 저장 대상(아직 DB에 쓰지 않은 포인트)을 꺼낸다. */
  drainUnsavedPoints(): TrackPoint[] {
    const out = this.points.slice(this.unsavedFrom);
    this.unsavedFrom = this.points.length;
    return out;
  }

  serialize(): EngineState {
    return { ...this.state, autoPause: this.detector.serialize(), pauses: [...this.state.pauses], stepSamples: [...this.state.stepSamples] };
  }

  /**
   * 크래시 복구: 저장된 상태와 포인트로 엔진을 되살린다.
   * 앱이 꺼져 있던 시간은 기록되지 않았으므로, 마지막 저장 시점부터 재개 시점까지를 일시정지로 처리한다.
   */
  static restore(state: EngineState, points: TrackPoint[], now: number, lastSavedAt: number): TrackingEngine {
    const engine = new TrackingEngine(state.options);
    engine.state = { ...state, pauses: [...state.pauses], stepSamples: [...state.stepSamples] };
    engine.detector.restore({ slowSince: null, paused: false, fastCount: 0 });
    const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
    for (const p of sorted) {
      const prev = engine.points.length > 0 ? engine.points[engine.points.length - 1] : null;
      const breakBefore = prev !== null && state.pauses.some((pz) => pz.end > prev.timestamp && pz.end <= p.timestamp);
      const add = prev && !breakBefore ? haversineDistance(prev, p) : 0;
      engine.points.push(p);
      engine.cum.push((engine.cum[engine.cum.length - 1] ?? 0) + add);
      engine.moving.push(engine.movingSecAt(p.timestamp));
      if (p.altitude !== null) engine.altitudes.push(p.altitude);
    }
    engine.unsavedFrom = engine.points.length;
    engine.state.distanceM = engine.cum.length > 0 ? engine.cum[engine.cum.length - 1] : state.distanceM;
    const s = engine.state;
    if (s.status === 'running' || s.status === 'autoPaused') {
      if (s.openPauseStart === null) s.openPauseStart = Math.min(lastSavedAt, now);
      s.status = 'paused';
    }
    return engine;
  }
}

export function isActiveStatus(status: TrackingStatus): boolean {
  return status === 'running' || status === 'paused' || status === 'autoPaused';
}
