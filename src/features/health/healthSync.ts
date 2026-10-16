import { Platform } from 'react-native';
import { ACTIVITY_CONFIGS } from '../activity/activityConfig';
import type { Activity } from '../../types';

// 헬스 앱 연동(iOS HealthKit / Android Health Connect).
// 사용자가 설정에서 켠 경우에만 동작하며, 기기 안의 헬스 저장소에 쓰는 것이므로 외부 서버 전송이 아니다.
// 네이티브 모듈이 없는 환경(Expo Go/테스트)에서는 조용히 false를 돌려준다.

interface HealthKitModule {
  initHealthKit(permissions: { permissions: { read: string[]; write: string[] } }, cb: (err: string) => void): void;
  saveWorkout(options: HealthKitWorkout, cb: (err: string) => void): void;
}

interface HealthKitWorkout {
  type: string;
  startDate: string;
  endDate: string;
  energyBurned: number;
  energyBurnedUnit: string;
  distance: number;
  distanceUnit: string;
}

interface HealthConnectModule {
  initialize(): Promise<boolean>;
  requestPermission(permissions: { accessType: 'write'; recordType: string }[]): Promise<{ accessType: string; recordType: string }[]>;
  insertRecords(records: Record<string, unknown>[]): Promise<string[]>;
  ExerciseType: Record<string, number>;
}

function loadHealthKit(): HealthKitModule | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-health') as { default?: HealthKitModule } & HealthKitModule;
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

function loadHealthConnect(): HealthConnectModule | null {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-health-connect') as HealthConnectModule;
  } catch {
    return null;
  }
}

const HC_RECORDS = ['ExerciseSession', 'Distance', 'TotalCaloriesBurned', 'Steps'];

/** 설정에서 연동을 켤 때 권한을 요청한다. */
export async function requestHealthPermission(): Promise<boolean> {
  const hk = loadHealthKit();
  if (hk) {
    return new Promise<boolean>((resolve) => {
      hk.initHealthKit({ permissions: { read: [], write: ['Workout', 'DistanceWalkingRunning', 'DistanceCycling', 'ActiveEnergyBurned', 'Steps'] } }, (err) => resolve(!err));
    });
  }
  const hc = loadHealthConnect();
  if (hc) {
    try {
      if (!(await hc.initialize())) return false;
      const granted = await hc.requestPermission(HC_RECORDS.map((recordType) => ({ accessType: 'write', recordType })));
      return granted.some((g) => g.recordType === 'ExerciseSession');
    } catch {
      return false;
    }
  }
  return false;
}

/** 모드에 맞는 운동 유형(Running/Walking/Cycling)으로 저장한다. */
export async function saveActivityToHealth(activity: Activity): Promise<boolean> {
  const config = ACTIVITY_CONFIGS[activity.type];
  const start = new Date(activity.startedAt);
  const pausedMs = activity.details.pauses.reduce((acc, p) => acc + (p.end - p.start), 0);
  const end = new Date(activity.startedAt + activity.durationSec * 1000 + pausedMs);
  const hk = loadHealthKit();
  if (hk) {
    const workout: HealthKitWorkout = {
      type: config.healthKitType,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      energyBurned: activity.calories,
      energyBurnedUnit: 'calorie',
      distance: activity.distanceM,
      distanceUnit: 'meter',
    };
    return new Promise<boolean>((resolve) => hk.saveWorkout(workout, (err) => resolve(!err)));
  }
  const hc = loadHealthConnect();
  if (hc) {
    try {
      await hc.initialize();
      const time = { startTime: start.toISOString(), endTime: end.toISOString() };
      const records: Record<string, unknown>[] = [
        { recordType: 'ExerciseSession', ...time, exerciseType: hc.ExerciseType[config.healthConnectType], title: activity.title },
        { recordType: 'TotalCaloriesBurned', ...time, energy: { unit: 'kilocalories', value: activity.calories } },
      ];
      if (activity.distanceM > 0) records.push({ recordType: 'Distance', ...time, distance: { unit: 'meters', value: activity.distanceM } });
      if (activity.steps) records.push({ recordType: 'Steps', ...time, count: activity.steps });
      await hc.insertRecords(records);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
