import { DEFAULT_BIKE_COMPONENTS, componentDistance, gearAlerts, gearDistance, gearKindFor, pickDefaultGear, shoeWearLevel, wearLevel } from '../../src/features/gear/gear';
import { base64ToBytes, computeCscRates, parseCsc, parseHeartRate } from '../../src/features/sensors/bleParsers';
import { HR_ZONE_LABELS, computeHrZones, estimateMaxHeartRate, resolveMaxHeartRate, zoneOf } from '../../src/features/sensors/heartRateZones';
import { buildSosMessage, isValidPhone, mapLink, normalizePhone, openSosComposer } from '../../src/features/safety/sos';
import { clampPrivacyRadius, hidePrivateEnds } from '../../src/features/share/privacy';
import { announceMessage, finishMessage, speedPhrase, startMessage, statusMessage } from '../../src/features/tracking/voiceMessages';
import * as fmt from '../../src/utils/format';
import { addDays, addMonths, dayKey, daysBetween, startOfMonth, startOfWeek, startOfYear } from '../../src/utils/date';
import { ORIGIN, makeSummary, offset, straightLine } from '../helpers/fixtures';
import type { Gear, GearComponent } from '../../src/types';

jest.mock('expo-sms', () => ({ isAvailableAsync: jest.fn(async () => true), sendSMSAsync: jest.fn(async () => ({ result: 'sent' })) }));

describe('표시 형식', () => {
  it('페이스 5\'32"/km, 속도 24.5 km/h', () => {
    expect(fmt.formatPace(1000 / 332, 'km')).toBe('5\'32"/km');
    expect(fmt.formatSpeed(24.5 / 3.6, 'km')).toBe('24.5 km/h');
    expect(fmt.formatSpeed(10, 'mi')).toBe('22.4 mph');
    expect(fmt.formatPaceValue(0, 'km')).toBe('-\'--"');
    expect(fmt.formatPaceValue(1000 / 359.7, 'km')).toBe('6\'00"');
    expect(fmt.formatPrimary(3, 'speed', 'km')).toBe('10.8 km/h');
  });

  it('거리/시간/단위 변환', () => {
    expect(fmt.formatDistance(5234, 'km')).toBe('5.23 km');
    expect(fmt.formatDistance(1609.344, 'mi')).toBe('1.00 mi');
    expect(fmt.unitToMeters(2, 'mi')).toBeCloseTo(3218.688);
    expect(fmt.formatDuration(65)).toBe('1:05');
    expect(fmt.formatDuration(3723)).toBe('1:02:03');
    expect(fmt.paceSecToSpeed(300, 'km')).toBeCloseTo(3.333, 3);
    expect(fmt.paceSecToSpeed(0, 'km')).toBe(0);
    expect(fmt.formatBytes(2048)).toBe('2.0 KB');
    expect(fmt.formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(fmt.formatBytes(10)).toBe('10 B');
    expect(fmt.formatElevation(12.4)).toBe('12 m');
    expect(fmt.formatNumber(12345)).toMatch(/12,345/);
    expect(fmt.formatDateTime(new Date(2026, 9, 16, 7, 5).getTime())).toBe('2026. 10. 16. (금) 오전 7:05');
  });

  it('음성용 문구', () => {
    expect(fmt.spokenDuration(3723)).toBe('1시간 2분 3초');
    expect(fmt.spokenDuration(0)).toBe('0초');
    expect(fmt.spokenDistance(5000, 'km')).toBe('5킬로미터');
    expect(fmt.spokenDistance(2500, 'km')).toBe('2.5킬로미터');
    expect(fmt.spokenPace(0, 'km')).toBe('측정 불가');
    expect(fmt.spokenSpeed(10, 'km')).toBe('시속 36.0킬로미터');
  });
});

describe('음성 안내 문구', () => {
  it('달리기는 페이스, 자전거는 속도', () => {
    expect(speedPhrase('run', 1000 / 330, 'km')).toBe('페이스 5분 30초');
    expect(speedPhrase('ride', 25 / 3.6, 'km')).toBe('시속 25.0킬로미터');
    const m = announceMessage('run', { distanceM: 3000, movingSec: 1000, segmentSpeedMps: 1000 / 330, avgSpeedMps: 3 }, 'km', { heartRate: 150 });
    expect(m).toContain('3킬로미터');
    expect(m).toContain('구간 페이스 5분 30초');
    expect(m).toContain('심박 150');
    expect(startMessage('ride', true)).toBe('실내 자전거 기록을 시작합니다.');
    expect(finishMessage('walk', 2000, 1500, 1.3, 'km')).toContain('산책 종료');
    expect(statusMessage('ride', 10000, 1800, 7, 6, 'km')).toContain('현재 시속');
  });
});

describe('날짜', () => {
  it('주는 월요일 시작', () => {
    const fri = new Date(2026, 9, 16, 15).getTime();
    expect(new Date(startOfWeek(fri)).getDate()).toBe(12);
    expect(new Date(startOfWeek(new Date(2026, 9, 18).getTime())).getDate()).toBe(12); // 일요일
    expect(new Date(startOfMonth(fri)).getDate()).toBe(1);
    expect(new Date(startOfYear(fri)).getMonth()).toBe(0);
    expect(dayKey(fri)).toBe('2026-10-16');
    expect(daysBetween(fri, addDays(fri, 3))).toBe(3);
    expect(new Date(addMonths(fri, 3)).getFullYear()).toBe(2027);
  });
});

describe('장비', () => {
  const now = 0;
  const shoe: Gear = { id: 's', kind: 'shoe', name: '러닝화', brand: '', activityTypes: ['run', 'walk'], initialDistanceM: 550_000, retireAtM: 700_000, retired: false, createdAt: now, updatedAt: now };
  const bike: Gear = { id: 'b', kind: 'bike', name: '로드', brand: '', activityTypes: ['ride'], initialDistanceM: 0, retireAtM: 0, retired: false, createdAt: now, updatedAt: now };
  const chain: GearComponent = { id: 'c', gearId: 'b', name: '체인', installedAtGearDistanceM: 500_000, replaceAfterM: 3_000_000, createdAt: now, updatedAt: now };

  it('누적 거리와 교체 알림', () => {
    const acts = [makeSummary({ gearId: 's', distanceM: 60_000 }), makeSummary({ gearId: 'b', distanceM: 3_200_000, type: 'ride' })];
    expect(gearDistance(shoe, acts)).toBe(610_000);
    expect(componentDistance(chain, 3_200_000)).toBe(2_700_000);
    const alerts = gearAlerts([shoe, bike], [chain], acts);
    expect(alerts).toHaveLength(2);
    expect(alerts[0].level).toBe('warning');
    expect(alerts[1].message).toContain('체인');
    expect(gearAlerts([{ ...shoe, retired: true }], [], acts)).toEqual([]);
  });

  it('마모 단계', () => {
    expect(shoeWearLevel(500_000, 700_000)).toBe('ok');
    expect(shoeWearLevel(650_000, 700_000)).toBe('warning');
    expect(shoeWearLevel(700_000, 700_000)).toBe('replace');
    expect(wearLevel(2_500_000, 3_000_000)).toBe('warning');
    expect(wearLevel(1, 0)).toBe('ok');
    expect(DEFAULT_BIKE_COMPONENTS.find((c) => c.name === '체인')?.replaceAfterM).toBe(3_000_000);
  });

  it('기본 장비 자동 지정', () => {
    expect(gearKindFor('ride')).toBe('bike');
    expect(pickDefaultGear('run', [shoe], {})).toBe('s');
    expect(pickDefaultGear('run', [shoe, { ...shoe, id: 's2' }], {})).toBeNull();
    expect(pickDefaultGear('run', [shoe, { ...shoe, id: 's2' }], { run: 's2' })).toBe('s2');
    expect(pickDefaultGear('ride', [shoe], {})).toBeNull();
  });
});

describe('BLE 파서', () => {
  it('base64 디코딩', () => {
    expect(Array.from(base64ToBytes('AAE='))).toEqual([0, 1]);
    expect(Array.from(base64ToBytes('/w=='))).toEqual([255]);
  });

  it('심박 uint8 / uint16', () => {
    expect(parseHeartRate(Uint8Array.from([0x00, 72]))).toBe(72);
    expect(parseHeartRate(Uint8Array.from([0x01, 0x2c, 0x01]))).toBe(300);
    expect(parseHeartRate(Uint8Array.from([0x00]))).toBeNull();
    expect(parseHeartRate(Uint8Array.from([0x01, 0x10]))).toBeNull();
  });

  it('CSC 속도/케이던스(랩어라운드 포함)', () => {
    const a = parseCsc(Uint8Array.from([0x03, 100, 0, 0, 0, 0x00, 0xfc, 50, 0, 0x00, 0xfc]));
    expect(a).toEqual({ wheelRevs: 100, wheelEventTime: 0xfc00, crankRevs: 50, crankEventTime: 0xfc00 });
    // 1초(1024 tick) 뒤, 0xFFFF를 넘어 랩어라운드
    const b = parseCsc(Uint8Array.from([0x03, 104, 0, 0, 0, 0x00, 0x00, 51, 0, 0x00, 0x00]));
    const r = computeCscRates(a, b, 2.105);
    expect(r.speedMps).toBeCloseTo(4 * 2.105);
    expect(r.cadenceRpm).toBeCloseTo(60);
    expect(computeCscRates(b, b, 2.105)).toEqual({ speedMps: 0, cadenceRpm: 0 });
    expect(parseCsc(Uint8Array.from([0x02, 10, 0, 0, 4]))).toMatchObject({ wheelRevs: null, crankRevs: 10, crankEventTime: 1024 });
  });
});

describe('심박 구간', () => {
  it('최대 심박 = 입력값 또는 220-나이', () => {
    const now = new Date(2026, 0, 1).getTime();
    expect(estimateMaxHeartRate(1986, now)).toBe(180);
    expect(estimateMaxHeartRate(null, now)).toBeNull();
    expect(resolveMaxHeartRate(190, 1986, now)).toBe(190);
    expect(resolveMaxHeartRate(null, 1986, now)).toBe(180);
  });

  it('구간 판정과 체류 시간', () => {
    expect(zoneOf(80, 200)).toBeNull();
    expect(zoneOf(100, 200)).toBe(0);
    expect(zoneOf(150, 200)).toBe(2);
    expect(zoneOf(195, 200)).toBe(4);
    const pts = [130, 130, 150, 190, 190].map((hr, i) => ({ timestamp: i * 10_000, heartRate: hr }));
    expect(computeHrZones(pts, [], 200)).toEqual([0, 20, 10, 0, 10]);
    expect(computeHrZones([{ timestamp: 0, heartRate: null }], [], 200)).toBeNull();
    expect(HR_ZONE_LABELS).toHaveLength(5);
  });
});

describe('프라이버시 존', () => {
  it('출발/도착 부분을 숨기고 중간은 유지', () => {
    const pts = straightLine({ speedMps: 10, intervalSec: 1, count: 201 }); // 0~2000m
    const zones = [
      { id: 'h', name: '집', ...ORIGIN, radiusM: 300 },
      { id: 'o', name: '회사', ...offset(ORIGIN, 2000, 0), radiusM: 200 },
    ];
    const hidden = hidePrivateEnds(pts, zones);
    expect(hidden[0].longitude).toBeGreaterThan(pts[30].longitude);
    expect(hidden[hidden.length - 1].longitude).toBeLessThan(pts[180].longitude);
    expect(hidePrivateEnds(pts, [])).toBe(pts);
    expect(hidePrivateEnds(pts.slice(0, 5), zones)).toEqual([]);
    expect(clampPrivacyRadius(100)).toBe(200);
    expect(clampPrivacyRadius(900)).toBe(500);
  });
});

describe('긴급 위치 문자', () => {
  it('지도 링크가 담긴 메시지', () => {
    const msg = buildSosMessage({ latitude: 37.5, longitude: 127.01 }, new Date(2026, 9, 16, 7, 5).getTime(), '달리기');
    expect(msg).toContain('https://maps.google.com/?q=37.500000,127.010000');
    expect(msg).toContain('07:05');
    expect(buildSosMessage(null, 0, '산책')).toContain('확인할 수 없습니다');
    expect(mapLink({ latitude: 1, longitude: 2 })).toBe('https://maps.google.com/?q=1.000000,2.000000');
    expect(normalizePhone('010-1234-5678')).toBe('01012345678');
    expect(isValidPhone('010-1234-5678')).toBe(true);
    expect(isValidPhone('12')).toBe(false);
  });

  it('작성 화면만 열고 자동 전송하지 않는다', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SMS = require('expo-sms') as { sendSMSAsync: jest.Mock };
    expect(await openSosComposer([], null, '달리기')).toBe('noContacts');
    expect(await openSosComposer([{ id: '1', name: '엄마', phone: '010-1111-2222' }], ORIGIN, '달리기')).toBe('opened');
    expect(SMS.sendSMSAsync).toHaveBeenCalledWith(['01011112222'], expect.stringContaining('[긴급]'));
  });
});
