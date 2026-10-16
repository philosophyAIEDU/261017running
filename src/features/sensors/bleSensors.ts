import { PermissionsAndroid, Platform } from 'react-native';
import type { BleManager as BleManagerType, Device, Subscription } from 'react-native-ble-plx';
import {
  CSC_MEASUREMENT,
  CSC_SERVICE,
  HEART_RATE_MEASUREMENT,
  HEART_RATE_SERVICE,
  base64ToBytes,
  computeCscRates,
  parseCsc,
  parseHeartRate,
  type CscMeasurement,
} from './bleParsers';
import type { PairedSensor, SensorKind } from '../../types';

// BLE 센서 연결 관리. react-native-ble-plx는 네이티브 모듈이므로 Development Build에서만 동작한다.
// 모듈이 없으면(Expo Go, 테스트) 센서 기능을 조용히 비활성화한다.

export interface SensorCallbacks {
  onHeartRate?: (bpm: number) => void;
  onSpeed?: (speedMps: number) => void;
  onCadence?: (rpm: number) => void;
  onDisconnected?: (sensor: PairedSensor) => void;
}

export interface ScannedSensor {
  id: string;
  name: string;
  kind: SensorKind;
}

let manager: BleManagerType | null = null;

function getManager(): BleManagerType | null {
  if (manager) return manager;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ble = require('react-native-ble-plx') as typeof import('react-native-ble-plx');
    manager = new ble.BleManager();
    return manager;
  } catch {
    return null;
  }
}

export function isBleAvailable(): boolean {
  return getManager() !== null;
}

async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);
  return Object.values(result).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
}

/** 심박/자전거 센서를 검색한다. 반환 함수를 호출하면 검색을 멈춘다. */
export async function scanSensors(onFound: (s: ScannedSensor) => void, onError: (message: string) => void): Promise<() => void> {
  const m = getManager();
  if (!m) {
    onError('이 빌드에서는 블루투스를 사용할 수 없습니다(Development Build 필요).');
    return () => undefined;
  }
  if (!(await requestBlePermissions())) {
    onError('블루투스 권한이 필요합니다.');
    return () => undefined;
  }
  const seen = new Set<string>();
  await m.startDeviceScan([HEART_RATE_SERVICE, CSC_SERVICE], null, (error, device) => {
    if (error) {
      onError(error.message);
      return;
    }
    if (!device || seen.has(device.id)) return;
    seen.add(device.id);
    const uuids = (device.serviceUUIDs ?? []).map((u) => u.toLowerCase());
    const kind: SensorKind = uuids.some((u) => u.startsWith('00001816') || u === '1816') ? 'cyclingSpeedCadence' : 'heartRate';
    onFound({ id: device.id, name: device.name ?? device.localName ?? '이름 없는 센서', kind });
  });
  return () => {
    void m.stopDeviceScan();
  };
}

const subscriptions: Subscription[] = [];
const connected = new Map<string, Device>();

/**
 * 등록된 센서에 연결하고 측정값을 콜백으로 전달한다.
 * CSC 센서는 누적 회전수만 보내므로 직전 측정값과의 차이로 속도/케이던스를 계산한다.
 */
export async function connectSensors(sensors: PairedSensor[], wheelCircumferenceM: number, cb: SensorCallbacks): Promise<number> {
  const m = getManager();
  if (!m || sensors.length === 0) return 0;
  if (!(await requestBlePermissions())) return 0;
  let count = 0;
  for (const sensor of sensors) {
    try {
      const device = await m.connectToDevice(sensor.id, { timeout: 8000 });
      await device.discoverAllServicesAndCharacteristics();
      connected.set(sensor.id, device);
      count += 1;
      subscriptions.push(
        m.onDeviceDisconnected(sensor.id, () => {
          connected.delete(sensor.id);
          cb.onDisconnected?.(sensor);
        }),
      );
      if (sensor.kind === 'heartRate') {
        subscriptions.push(
          device.monitorCharacteristicForService(HEART_RATE_SERVICE, HEART_RATE_MEASUREMENT, (err, ch) => {
            if (err || !ch?.value) return;
            const bpm = parseHeartRate(base64ToBytes(ch.value));
            if (bpm !== null && bpm > 25 && bpm < 250) cb.onHeartRate?.(bpm);
          }),
        );
      } else {
        let prev: CscMeasurement | null = null;
        subscriptions.push(
          device.monitorCharacteristicForService(CSC_SERVICE, CSC_MEASUREMENT, (err, ch) => {
            if (err || !ch?.value) return;
            const cur = parseCsc(base64ToBytes(ch.value));
            if (prev) {
              const rates = computeCscRates(prev, cur, wheelCircumferenceM);
              if (rates.speedMps !== null) cb.onSpeed?.(rates.speedMps);
              if (rates.cadenceRpm !== null) cb.onCadence?.(Math.round(rates.cadenceRpm));
            }
            prev = cur;
          }),
        );
      }
    } catch {
      // 연결 실패한 센서는 건너뛴다(배터리 방전, 범위 밖 등)
    }
  }
  return count;
}

export async function disconnectSensors(): Promise<void> {
  while (subscriptions.length > 0) subscriptions.pop()?.remove();
  const m = getManager();
  if (!m) return;
  for (const id of connected.keys()) {
    try {
      await m.cancelDeviceConnection(id);
    } catch {
      // 이미 끊긴 경우 무시
    }
  }
  connected.clear();
}
