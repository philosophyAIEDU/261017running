import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';

// 권한 요청 순서
// 1) "앱 사용 중" 위치 권한을 먼저 요청한다.
// 2) 백그라운드 위치·동작(걸음) 권한은 화면에서 이유를 설명한 뒤(PermissionExplainer) 요청한다.
// 위치 권한이 거부되면 실내 모드로 안내한다.

export type PermissionResult = 'granted' | 'foregroundOnly' | 'denied';

export async function getLocationPermissionState(): Promise<PermissionResult> {
  const fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';
  const bg = await Location.getBackgroundPermissionsAsync();
  return bg.granted ? 'granted' : 'foregroundOnly';
}

export async function requestForegroundLocation(): Promise<boolean> {
  const res = await Location.requestForegroundPermissionsAsync();
  return res.granted;
}

export async function requestBackgroundLocation(): Promise<boolean> {
  const res = await Location.requestBackgroundPermissionsAsync();
  return res.granted;
}

export async function hasMotionPermission(): Promise<boolean> {
  try {
    return (await Pedometer.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function requestMotionPermission(): Promise<boolean> {
  try {
    return (await Pedometer.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}
