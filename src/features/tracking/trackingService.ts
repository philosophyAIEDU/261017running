import * as Haptics from 'expo-haptics';
import { Vibration } from 'react-native';
import { ACTIVITY_CONFIGS } from '../activity/activityConfig';
import { saveActivity, type SaveOutcome } from '../activity/activityService';
import { buildActivity, type BuildInput } from './activityBuilder';
import { BackgroundLocationSource, type LocationSource } from './locationSource';
import { StepCounter } from './pedometer';
import { AcceleratedClock, GpxReplaySource, loadSampleGpx, prepareReplay, systemClock, type Clock } from './simulator';
import { TrackingEngine, isActiveStatus, type EngineEvent, type EngineState } from './trackingEngine';
import { speak, setVoiceEnabled } from './voiceCoach';
import {
  AUTO_PAUSE_MESSAGE,
  AUTO_RESUME_MESSAGE,
  PAUSE_MESSAGE,
  RESUME_MESSAGE,
  announceMessage,
  finishMessage,
  startMessage,
  statusMessage,
} from './voiceMessages';
import { gearKindFor, pickDefaultGear } from '../gear/gear';
import { saveActivityToHealth } from '../health/healthSync';
import { connectSensors, disconnectSensors } from '../sensors/bleSensors';
import { resolveMaxHeartRate } from '../sensors/heartRateZones';
import { estimateDistanceFromSteps } from '../workouts/indoor';
import { buildPhases, detectTransition, phaseAnnouncement, phaseAt, type IntervalPhase } from '../workouts/interval';
import { evaluateTarget, initialTargetState, type TargetCoachState } from '../workouts/targetCoach';
import { getRepositories } from '../../db/database';
import { bumpData } from '../../store/dataStore';
import { getSettings, useSettingsStore } from '../../store/settingsStore';
import { FREE_WORKOUT, patchTracking, resetTracking, useTrackingStore } from '../../store/trackingStore';
import { newId } from '../../utils/id';
import type { Activity, ActivityType, TrackPoint, WorkoutSettings } from '../../types';

// 기록 세션 오케스트레이터.
// 엔진(순수 로직)에 위치/걸음/센서 입력을 연결하고, 1초 타이머로 화면 스냅샷·음성·인터벌을 갱신하며,
// 10초마다 진행 상태와 새 GPS 포인트를 SQLite에 저장해 강제 종료 시 복구할 수 있게 한다.

export const PERSIST_INTERVAL_MS = 10_000;
const COUNTDOWN_SEC = 3;
const GPS_WEAK_AFTER_MS = 15_000;

export interface StartOptions {
  type: ActivityType;
  workout?: WorkoutSettings;
  isIndoor?: boolean;
  skipCountdown?: boolean;
}

export interface Draft {
  input: BuildInput;
  activity: Activity;
}

interface Session {
  engine: TrackingEngine;
  clock: Clock;
  source: LocationSource | null;
  steps: StepCounter | null;
  ticker: ReturnType<typeof setInterval> | null;
  lastPersistAt: number;
  savedPointCount: number;
  targetState: TargetCoachState;
  phases: IntervalPhase[];
  lastMovingSec: number;
  pausedAt: number | null;
  workout: WorkoutSettings;
}

let session: Session | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let draft: Draft | null = null;

function unit(): 'km' | 'mi' {
  return getSettings().unit;
}

function handleEvents(events: EngineEvent[]): void {
  if (!session) return;
  const type = session.engine.options.type;
  for (const e of events) {
    if (e.type === 'announce') {
      speak(announceMessage(type, e, unit(), { heartRate: session.engine.snapshot(session.clock.now()).heartRate }));
    } else if (e.type === 'autoPaused') {
      speak(AUTO_PAUSE_MESSAGE);
      session.steps?.pause();
    } else if (e.type === 'autoResumed') {
      speak(AUTO_RESUME_MESSAGE);
      session.steps?.resume();
    }
  }
}

function publish(): void {
  if (!session) return;
  const now = session.clock.now();
  const snap = session.engine.snapshot(now);
  const points = session.engine.getPoints();
  const last = points.length > 0 ? points[points.length - 1] : null;
  patchTracking({
    status: snap.status,
    snapshot: snap,
    path: points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
    intervalStatus: session.phases.length > 0 ? phaseAt(session.phases, snap.movingSec) : null,
    gpsWeak: !session.engine.options.isIndoor && snap.status === 'running' && (last === null || now - last.timestamp > GPS_WEAK_AFTER_MS),
  });
}

function onTick(): void {
  if (!session) return;
  const now = session.clock.now();
  handleEvents(session.engine.tick(now));
  const snap = session.engine.snapshot(now);
  // 인터벌 구간 전환: 음성 + 진동
  if (session.phases.length > 0 && snap.status === 'running') {
    const next = detectTransition(session.phases, session.lastMovingSec, snap.movingSec);
    if (next) {
      speak(phaseAnnouncement(next, session.workout.interval?.repeats ?? 0));
      Vibration.vibrate([0, 400, 200, 400]);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    }
  }
  // 목표 활동: 목표 페이스/속도 이탈, 목표 거리·시간 달성 안내
  if (session.workout.target && snap.status === 'running') {
    const res = evaluateTarget(session.workout.target, session.targetState, { movingSec: snap.movingSec, distanceM: snap.distanceM, currentSpeedMps: snap.currentSpeedMps }, snap.type, unit());
    session.targetState = res.state;
    res.messages.forEach(speak);
  }
  session.lastMovingSec = snap.movingSec;
  publish();
  if (Date.now() - session.lastPersistAt >= PERSIST_INTERVAL_MS) void persist();
}

/** 크래시 복구용 저장: 엔진 상태(JSON) + 아직 저장하지 않은 포인트(일괄 삽입) */
async function persist(): Promise<void> {
  if (!session) return;
  const s = session;
  s.lastPersistAt = Date.now();
  const repos = getRepositories();
  const id = s.engine.options.activityId;
  const newPoints = s.engine.drainUnsavedPoints();
  if (newPoints.length > 0) {
    await repos.activities.appendTrackPoints(id, newPoints, s.savedPointCount);
    s.savedPointCount += newPoints.length;
  }
  const state = { engine: s.engine.serialize(), workout: s.workout, savedAt: s.clock.now() };
  await repos.recovery.save({ id, state: JSON.stringify(state), savedAt: Date.now() });
}

function onLocations(locations: Parameters<TrackingEngine['addLocations']>[0]): void {
  if (!session) return;
  handleEvents(session.engine.addLocations(locations));
  // 백그라운드에서는 setInterval이 늦게 돌 수 있으므로 위치 이벤트에서도 저장 주기를 확인한다.
  if (Date.now() - session.lastPersistAt >= PERSIST_INTERVAL_MS) void persist();
}

async function createSource(type: ActivityType, isIndoor: boolean, clock: Clock, allowSimulation: boolean): Promise<LocationSource | null> {
  if (isIndoor) return null;
  if (allowSimulation && getSettings().simulationEnabled) {
    const text = await loadSampleGpx(type);
    return new GpxReplaySource(prepareReplay(text, clock.now()), clock);
  }
  return new BackgroundLocationSource();
}

async function beginTracking(opts: Required<Pick<StartOptions, 'type' | 'isIndoor'>> & { workout: WorkoutSettings }): Promise<void> {
  const settings = getSettings();
  const config = ACTIVITY_CONFIGS[opts.type];
  const clock: Clock = settings.simulationEnabled && !opts.isIndoor ? new AcceleratedClock(Date.now(), settings.simulationSpeed) : systemClock;
  const activityId = useTrackingStore.getState().activityId ?? newId();
  const engine = new TrackingEngine({
    activityId,
    type: opts.type,
    autoPauseEnabled: settings.autoPauseEnabled[opts.type] && !opts.isIndoor,
    weightKg: settings.weightKg,
    isIndoor: opts.isIndoor,
  });
  const now = clock.now();
  engine.start(now);
  session = {
    engine,
    clock,
    source: null,
    steps: null,
    ticker: null,
    lastPersistAt: Date.now(),
    savedPointCount: 0,
    targetState: initialTargetState(),
    phases: opts.workout.interval ? buildPhases(opts.workout.interval) : [],
    lastMovingSec: 0,
    pausedAt: null,
    workout: opts.workout,
  };
  await attachInputs(session, config.usesPedometer, 0, true);
  session.ticker = setInterval(onTick, 1000);
  speak(startMessage(opts.type, opts.isIndoor));
  if (session.phases.length > 0) speak(phaseAnnouncement(session.phases[0], opts.workout.interval?.repeats ?? 0));
  patchTracking({ phase: 'active', activityId, status: 'running' });
  publish();
  await persist();
}

async function attachInputs(s: Session, usesPedometer: boolean, initialSteps: number, allowSimulation: boolean): Promise<void> {
  const settings = getSettings();
  const type = s.engine.options.type;
  s.source = await createSource(type, s.engine.options.isIndoor, s.clock, allowSimulation);
  if (s.source) await s.source.start(ACTIVITY_CONFIGS[type], onLocations);
  if (usesPedometer && (await StepCounter.isAvailable())) {
    s.steps = new StepCounter((total) => session?.engine.setSteps(total, session.clock.now()));
    s.steps.start(initialSteps);
    if (s.engine.status !== 'running') s.steps.pause();
  }
  const sensors = settings.pairedSensors.filter((p) => p.kind === 'heartRate' || type === 'ride');
  if (sensors.length > 0) {
    const count = await connectSensors(sensors, settings.wheelCircumferenceMm / 1000, {
      onHeartRate: (bpm) => session?.engine.setHeartRate(bpm, session.clock.now()),
      onSpeed: (v) => session?.engine.setSensorSpeed(v, session.clock.now()),
      onCadence: (rpm) => session?.engine.setCadence(rpm, session.clock.now()),
      onDisconnected: (sensor) => speak(`${sensor.name} 센서 연결이 끊겼습니다.`),
    });
    patchTracking({ sensorsConnected: count });
  }
}

export function startSession(opts: StartOptions): void {
  const settings = getSettings();
  setVoiceEnabled(settings.voiceEnabled);
  const workout = opts.workout ?? FREE_WORKOUT;
  const isIndoor = opts.isIndoor ?? workout.kind === 'indoor';
  draft = null;
  patchTracking({
    phase: 'countdown',
    countdown: COUNTDOWN_SEC,
    activityId: newId(),
    type: opts.type,
    workout,
    isIndoor,
    status: 'idle',
    snapshot: null,
    path: [],
    finishedActivityId: null,
  });
  void useSettingsStore.getState().update({ lastActivityType: opts.type });
  const go = (): void => {
    void beginTracking({ type: opts.type, isIndoor, workout });
  };
  if (opts.skipCountdown) {
    go();
    return;
  }
  let remaining = COUNTDOWN_SEC;
  speak(String(remaining));
  countdownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = null;
      patchTracking({ countdown: 0 });
      go();
    } else {
      patchTracking({ countdown: remaining });
      speak(String(remaining));
    }
  }, 1000);
}

export function cancelCountdown(): void {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
  resetTracking();
}

export function pauseSession(): void {
  if (!session) return;
  const now = session.clock.now();
  session.engine.pause(now);
  session.pausedAt = now;
  session.steps?.pause();
  if (session.source instanceof GpxReplaySource) session.source.setPaused(true);
  speak(PAUSE_MESSAGE);
  publish();
  void persist();
}

export function resumeSession(): void {
  if (!session) return;
  const now = session.clock.now();
  session.engine.resume(now);
  session.steps?.resume();
  if (session.source instanceof GpxReplaySource) session.source.setPaused(false, session.pausedAt !== null ? now - session.pausedAt : 0);
  session.pausedAt = null;
  speak(RESUME_MESSAGE);
  publish();
}

export function speakCurrentStatus(): void {
  if (!session) return;
  const snap = session.engine.snapshot(session.clock.now());
  speak(statusMessage(snap.type, snap.distanceM, snap.movingSec, snap.currentSpeedMps, snap.avgSpeedMps, unit()));
}

export function getCurrentLocation(): { latitude: number; longitude: number } | null {
  return session?.engine.snapshot(session.clock.now()).lastLocation ?? null;
}

async function teardownInputs(s: Session): Promise<void> {
  if (s.ticker) clearInterval(s.ticker);
  s.ticker = null;
  await s.source?.stop();
  s.steps?.stop();
  await disconnectSensors();
}

/** 기록 종료: 활동 초안을 만들어 요약 화면으로 넘긴다(저장은 요약 화면에서). */
export async function finishSession(): Promise<Draft | null> {
  if (!session) return null;
  const s = session;
  const now = s.clock.now();
  s.engine.finish(now);
  await teardownInputs(s);
  await persist();
  const settings = getSettings();
  const type = s.engine.options.type;
  const gearList = await getRepositories().gear.list();
  const input: BuildInput = {
    id: s.engine.options.activityId,
    type,
    startedAt: s.engine.startedAt ?? now,
    endedAt: now,
    points: [...s.engine.getPoints()],
    pauses: [...s.engine.pauses],
    steps: s.steps ? s.steps.total : s.engine.steps,
    stepSamples: [...s.engine.stepSamples],
    workout: s.workout,
    source: settings.simulationEnabled && !s.engine.options.isIndoor ? 'simulation' : s.engine.options.isIndoor ? 'indoor' : 'gps',
    weightKg: settings.weightKg,
    maxHeartRate: resolveMaxHeartRate(settings.maxHeartRate, settings.birthYear),
    gearId: pickDefaultGear(type, gearList.filter((g) => g.kind === gearKindFor(type)), settings.defaultGearIds),
    isIndoor: s.engine.options.isIndoor,
    manualDistanceM: s.engine.options.isIndoor && type === 'walk' ? estimateDistanceFromSteps(s.steps ? s.steps.total : s.engine.steps, settings.heightCm) : null,
    now: Date.now(),
  };
  const activity = buildActivity(input);
  draft = { input, activity };
  speak(finishMessage(type, activity.distanceM, activity.durationSec, activity.avgSpeedMps, unit()));
  session = null;
  patchTracking({ phase: 'finished', status: 'finished', finishedActivityId: activity.id });
  return draft;
}

export function getDraft(): Draft | null {
  return draft;
}

/** 요약 화면에서 모드/거리(실내)를 바꾸면 초안을 다시 계산한다. */
export function updateDraft(patch: Partial<Pick<BuildInput, 'type' | 'manualDistanceM' | 'gearId'>>, meta: Pick<Activity, 'title' | 'note' | 'perceivedEffort'>): Draft | null {
  if (!draft) return null;
  const input = { ...draft.input, ...patch };
  const typeChanged = patch.type !== undefined && patch.type !== draft.input.type;
  const rebuilt = buildActivity(input, { ...meta, createdAt: draft.activity.createdAt });
  draft = { input, activity: typeChanged && meta.title === draft.activity.title ? { ...rebuilt, title: buildActivity(input).title } : rebuilt };
  return draft;
}

export async function saveDraft(meta: Pick<Activity, 'title' | 'note' | 'perceivedEffort'>): Promise<SaveOutcome | null> {
  if (!draft) return null;
  const repos = getRepositories();
  const activity: Activity = { ...draft.activity, ...meta, updatedAt: Date.now() };
  const outcome = await saveActivity(repos, activity, draft.input.points);
  await repos.recovery.clear();
  if (getSettings().healthSyncEnabled) {
    const ok = await saveActivityToHealth(activity);
    if (ok) await repos.activities.update({ ...activity, details: { ...activity.details, healthSynced: true } });
  }
  draft = null;
  resetTracking();
  bumpData();
  return outcome;
}

export async function discardDraft(): Promise<void> {
  const repos = getRepositories();
  // 재실행 직후 복구 안내에서 "버리기"를 누른 경우에는 메모리에 세션 정보가 없으므로 복구 기록의 id를 쓴다.
  const id = draft?.activity.id ?? useTrackingStore.getState().activityId ?? (await repos.recovery.get())?.id ?? null;
  draft = null;
  if (id) await repos.recovery.discard(id);
  resetTracking();
}

// ───────────── 크래시 복구 ─────────────

export interface RecoveryInfo {
  activityId: string;
  type: ActivityType;
  startedAt: number;
  distanceM: number;
  finished: boolean;
}

interface PersistedState {
  engine: EngineState;
  workout: WorkoutSettings;
  savedAt: number;
}

export async function checkRecovery(): Promise<RecoveryInfo | null> {
  if (session) return null;
  const snap = await getRepositories().recovery.get();
  if (!snap) return null;
  try {
    const state = JSON.parse(snap.state) as PersistedState;
    return {
      activityId: snap.id,
      type: state.engine.options.type,
      startedAt: state.engine.startedAt ?? snap.savedAt,
      distanceM: state.engine.distanceM,
      finished: state.engine.status === 'finished',
    };
  } catch {
    await getRepositories().recovery.discard(snap.id);
    return null;
  }
}

/**
 * 강제 종료 후 이어서 기록: 저장된 엔진 상태와 포인트로 세션을 되살린다.
 * 앱이 꺼져 있던 시간은 일시정지로 처리되므로, 사용자가 재개를 누르면 그 시점부터 다시 기록된다.
 */
export async function resumeRecovered(): Promise<'resumed' | 'finished' | 'none'> {
  const repos = getRepositories();
  const snap = await repos.recovery.get();
  if (!snap) return 'none';
  const state = JSON.parse(snap.state) as PersistedState;
  const points: TrackPoint[] = await repos.activities.getTrackPoints(snap.id);
  const engine = TrackingEngine.restore(state.engine, points, Date.now(), state.savedAt);
  const type = engine.options.type;
  patchTracking({
    phase: 'active',
    activityId: snap.id,
    type,
    workout: state.workout,
    isIndoor: engine.options.isIndoor,
    status: engine.status,
    finishedActivityId: null,
  });
  session = {
    engine,
    clock: systemClock,
    source: null,
    steps: null,
    ticker: null,
    lastPersistAt: Date.now(),
    savedPointCount: points.length,
    targetState: initialTargetState(),
    phases: state.workout.interval ? buildPhases(state.workout.interval) : [],
    lastMovingSec: engine.movingSecAt(Date.now()),
    pausedAt: Date.now(),
    workout: state.workout,
  };
  if (state.engine.status === 'finished') {
    await finishSession();
    return 'finished';
  }
  // 복구한 세션은 실제 GPS로 이어간다(시뮬레이션 재생 위치는 복원할 수 없으므로)
  await attachInputs(session, ACTIVITY_CONFIGS[type].usesPedometer, engine.steps ?? 0, false);
  session.ticker = setInterval(onTick, 1000);
  publish();
  return 'resumed';
}

export function isSessionActive(): boolean {
  return session !== null && isActiveStatus(session.engine.status);
}
