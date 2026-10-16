// BLE 표준 서비스 데이터 파서(순수 함수).
// Heart Rate Service 0x180D / Heart Rate Measurement 0x2A37
// Cycling Speed and Cadence 0x1816 / CSC Measurement 0x2A5B

export const HEART_RATE_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
export const HEART_RATE_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';
export const CSC_SERVICE = '00001816-0000-1000-8000-00805f9b34fb';
export const CSC_MEASUREMENT = '00002a5b-0000-1000-8000-00805f9b34fb';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** react-native-ble-plx는 값을 base64 문자열로 준다. RN에는 Buffer가 없으므로 직접 디코딩한다. */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    buffer = (buffer << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

/**
 * Heart Rate Measurement 파싱.
 * flags bit0 = 0이면 심박이 uint8, 1이면 uint16(little endian).
 */
export function parseHeartRate(bytes: Uint8Array): number | null {
  if (bytes.length < 2) return null;
  const flags = bytes[0];
  if (flags & 0x01) {
    if (bytes.length < 3) return null;
    return bytes[1] | (bytes[2] << 8);
  }
  return bytes[1];
}

export interface CscMeasurement {
  wheelRevs: number | null; // 누적 바퀴 회전수(uint32)
  wheelEventTime: number | null; // 마지막 바퀴 이벤트 시각(1/1024초, uint16)
  crankRevs: number | null; // 누적 크랭크 회전수(uint16)
  crankEventTime: number | null; // 1/1024초, uint16
}

/** CSC Measurement 파싱. flags bit0 = 바퀴 데이터 존재, bit1 = 크랭크 데이터 존재 */
export function parseCsc(bytes: Uint8Array): CscMeasurement {
  const flags = bytes[0] ?? 0;
  let offset = 1;
  const result: CscMeasurement = { wheelRevs: null, wheelEventTime: null, crankRevs: null, crankEventTime: null };
  const u16 = (o: number): number => bytes[o] | (bytes[o + 1] << 8);
  if (flags & 0x01 && bytes.length >= offset + 6) {
    result.wheelRevs = (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
    result.wheelEventTime = u16(offset + 4);
    offset += 6;
  }
  if (flags & 0x02 && bytes.length >= offset + 4) {
    result.crankRevs = u16(offset);
    result.crankEventTime = u16(offset + 2);
  }
  return result;
}

export interface CscRates {
  speedMps: number | null;
  cadenceRpm: number | null;
}

/**
 * 연속된 두 CSC 측정값으로 속도와 케이던스를 계산한다.
 * - 이벤트 시각은 1/1024초 단위 uint16이라 64초마다 0으로 돌아오므로 (cur - prev) & 0xFFFF로 랩어라운드를 처리한다.
 * - 회전수와 이벤트 시각이 모두 그대로면 정지 상태로 보고 0을 돌려준다. 그 밖에 계산할 수 없는 경우는 null.
 * 속도 = Δ바퀴회전 × 바퀴 둘레 / Δ시간, 케이던스 = Δ크랭크회전 / Δ시간 × 60
 */
export function computeCscRates(prev: CscMeasurement, cur: CscMeasurement, wheelCircumferenceM: number): CscRates {
  let speedMps: number | null = null;
  let cadenceRpm: number | null = null;
  if (prev.wheelRevs !== null && cur.wheelRevs !== null && prev.wheelEventTime !== null && cur.wheelEventTime !== null) {
    const dRevs = (cur.wheelRevs - prev.wheelRevs) >>> 0;
    const dt = ((cur.wheelEventTime - prev.wheelEventTime) & 0xffff) / 1024;
    if (dt > 0 && dRevs < 1000) speedMps = (dRevs * wheelCircumferenceM) / dt;
    else if (dt === 0 && dRevs === 0) speedMps = 0;
  }
  if (prev.crankRevs !== null && cur.crankRevs !== null && prev.crankEventTime !== null && cur.crankEventTime !== null) {
    const dRevs = (cur.crankRevs - prev.crankRevs) & 0xffff;
    const dt = ((cur.crankEventTime - prev.crankEventTime) & 0xffff) / 1024;
    if (dt > 0 && dRevs < 100) cadenceRpm = (dRevs / dt) * 60;
    else if (dt === 0 && dRevs === 0) cadenceRpm = 0;
  }
  return { speedMps, cadenceRpm };
}
