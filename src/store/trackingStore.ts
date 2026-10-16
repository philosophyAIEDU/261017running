import { create } from 'zustand';
import type { EngineSnapshot, TrackingStatus } from '../features/tracking/trackingEngine';
import type { PhaseStatus } from '../features/workouts/interval';
import type { ActivityType, LatLng, WorkoutSettings } from '../types';

// 기록 화면이 구독하는 UI 상태. 실제 트래킹은 trackingService가 담당하고 여기에 스냅샷을 밀어 넣는다.

export type SessionPhase = 'idle' | 'countdown' | 'active' | 'finished';

export interface TrackingUiState {
  phase: SessionPhase;
  countdown: number;
  activityId: string | null;
  type: ActivityType;
  workout: WorkoutSettings;
  isIndoor: boolean;
  status: TrackingStatus;
  snapshot: EngineSnapshot | null;
  path: LatLng[];
  intervalStatus: PhaseStatus | null;
  sensorsConnected: number;
  gpsWeak: boolean;
  /** 종료 후 요약 화면에 넘길 활동 id */
  finishedActivityId: string | null;
}

export const FREE_WORKOUT: WorkoutSettings = { kind: 'free', target: null, interval: null, planWorkoutId: null };

export const INITIAL_TRACKING_STATE: TrackingUiState = {
  phase: 'idle',
  countdown: 0,
  activityId: null,
  type: 'run',
  workout: FREE_WORKOUT,
  isIndoor: false,
  status: 'idle',
  snapshot: null,
  path: [],
  intervalStatus: null,
  sensorsConnected: 0,
  gpsWeak: false,
  finishedActivityId: null,
};

export const useTrackingStore = create<TrackingUiState>(() => INITIAL_TRACKING_STATE);

export function patchTracking(patch: Partial<TrackingUiState>): void {
  useTrackingStore.setState(patch);
}

export function resetTracking(): void {
  useTrackingStore.setState(INITIAL_TRACKING_STATE);
}
