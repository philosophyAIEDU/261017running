import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import type { ActivityConfig } from '../activity/activityConfig';
import type { RawLocation } from '../../types';

// 위치 소스 추상화: 실제 GPS(백그라운드 태스크)와 개발용 GPX 시뮬레이터가 같은 인터페이스를 구현한다.

export interface LocationSource {
  start(config: ActivityConfig, onLocations: (locations: RawLocation[]) => void): Promise<void>;
  stop(): Promise<void>;
}

export const LOCATION_TASK = 'activity-location-updates';

type Listener = (locations: RawLocation[]) => void;
let taskListener: Listener | null = null;
const pendingWhileDetached: RawLocation[] = [];

export function toRawLocation(l: Location.LocationObject): RawLocation {
  return {
    timestamp: l.timestamp,
    latitude: l.coords.latitude,
    longitude: l.coords.longitude,
    altitude: l.coords.altitude,
    accuracy: l.coords.accuracy,
    speed: l.coords.speed,
  };
}

/**
 * 백그라운드 위치 태스크는 반드시 모듈 최상위(전역 스코프)에서 정의해야 한다.
 * 앱이 백그라운드에서 깨어날 때 컴포넌트가 마운트되지 않아도 태스크가 등록되어 있어야 하기 때문이다.
 * 리스너가 아직 붙지 않았으면(앱 재시작 직후) 위치를 보관했다가 연결되면 전달한다.
 */
if (!TaskManager.isTaskDefined(LOCATION_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations) return;
    const locs = data.locations.map(toRawLocation);
    if (taskListener) taskListener(locs);
    else pendingWhileDetached.push(...locs);
  });
}

export class BackgroundLocationSource implements LocationSource {
  async start(config: ActivityConfig, onLocations: Listener): Promise<void> {
    taskListener = onLocations;
    if (pendingWhileDetached.length > 0) onLocations(pendingWhileDetached.splice(0));
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: config.gps.timeIntervalMs,
      distanceInterval: config.gps.distanceIntervalM,
      activityType: config.type === 'ride' ? Location.ActivityType.OtherNavigation : Location.ActivityType.Fitness,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      // Android: 화면이 꺼져도 기록이 계속되도록 포그라운드 서비스 알림을 띄운다.
      foregroundService: {
        notificationTitle: `${config.icon} ${config.label} 기록 중`,
        notificationBody: '앱을 열어 기록을 확인하거나 종료하세요.',
        notificationColor: config.color,
        killServiceOnDestroy: false,
      },
      ...(Platform.OS === 'ios' ? { deferredUpdatesInterval: 0 } : {}),
    });
  }

  async stop(): Promise<void> {
    taskListener = null;
    try {
      if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK);
      }
    } catch {
      // 이미 중지된 경우
    }
  }
}

/** 활동 중이 아닐 때 남아 있는 위치 업데이트를 완전히 중지한다(배터리 보호). */
export async function stopStrayLocationUpdates(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch {
    // 권한이 없거나 태스크가 없는 경우
  }
}
