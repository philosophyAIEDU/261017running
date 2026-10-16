import { readFileSync } from 'fs';
import { join } from 'path';
import { ACTIVITY_CONFIGS } from '../../src/features/activity/activityConfig';
import { estimateActivityType } from '../../src/features/activity/modeDetection';
import { parseGpx, toGpx } from '../../src/features/backup/gpx';
import { gpxToActivity, previewGpx } from '../../src/features/backup/gpxImport';
import { TrackingEngine } from '../../src/features/tracking/trackingEngine';
import { filterLocations, totalDistance } from '../../src/utils/geo';
import { straightLine, toTrackPoints } from '../helpers/fixtures';
import type { ActivityType } from '../../src/types';

describe('GPX 입출력', () => {
  it('내보낸 GPX를 다시 읽으면 좌표/시간/고도/심박이 같다', () => {
    const pts = toTrackPoints(straightLine({ speedMps: 3, intervalSec: 1, count: 30, altitude: (i) => 10 + i })).map((p, i) => ({ ...p, heartRate: 140 + i, cadence: 170 }));
    const xml = toGpx('아침 <달리기> & 산책', 'run', pts);
    expect(xml).toContain('&lt;달리기&gt; &amp;');
    const parsed = parseGpx(xml);
    expect(parsed.name).toBe('아침 <달리기> & 산책'.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    expect(parsed.typeHint).toBe('run');
    expect(parsed.points).toHaveLength(30);
    expect(parsed.points[5].latitude).toBeCloseTo(pts[5].latitude, 6);
    expect(parsed.points[5].timestamp).toBe(pts[5].timestamp);
    expect(parsed.points[5].altitude).toBeCloseTo(15, 1);
    expect(parsed.points[5].heartRate).toBe(145);
    expect(parsed.points[5].cadence).toBe(170);
  });

  it('형식 오류와 시간 없는 포인트', () => {
    expect(() => parseGpx('<html></html>')).toThrow('GPX');
    const p = parseGpx('<gpx><trk><trkseg><trkpt lat="37" lon="127"/><trkpt lat="37.001" lon="127"></trkpt><trkpt lon="1"></trkpt></trkseg></trk></gpx>');
    expect(p.points).toHaveLength(2);
    expect(p.points[1].timestamp).toBeGreaterThan(p.points[0].timestamp);
    expect(p.typeHint).toBeNull();
  });
});

describe('GPS 시뮬레이션 샘플 GPX (노이즈 포함)', () => {
  const load = (name: string): string => readFileSync(join(__dirname, '..', '..', 'assets', 'gpx', `${name}.gpx`), 'utf8');

  it.each([
    ['run', 'run', 5000, 5400],
    ['walk', 'walk', 2400, 2700],
    ['ride', 'ride', 14500, 15500],
  ] as const)('%s 샘플: 노이즈가 필터되고, 평균 속도로 모드를 맞게 추정한다', (file, expected, minM, maxM) => {
    const parsed = parseGpx(load(file));
    const type = expected as ActivityType;
    const kept = filterLocations(parsed.points, ACTIVITY_CONFIGS[type].filter);
    expect(kept.length).toBeLessThan(parsed.points.length); // 노이즈 포인트가 존재하고 걸러진다
    const raw = totalDistance(parsed.points);
    const clean = totalDistance(kept);
    expect(raw).toBeGreaterThan(clean * 1.2); // 순간이동 노이즈가 거리를 크게 부풀린다
    expect(clean).toBeGreaterThan(minM);
    expect(clean).toBeLessThan(maxM);
    const durationSec = (kept[kept.length - 1].timestamp - kept[0].timestamp) / 1000;
    expect(estimateActivityType(clean / durationSec)).toBe(type);
    expect(parsed.typeHint).toBe(type);
  });

  it('샘플 재생으로 엔진 전체 흐름(자동 일시정지 포함)을 검증', () => {
    const parsed = parseGpx(load('run'));
    const start = parsed.points[0].timestamp;
    const e = new TrackingEngine({ activityId: 'sim', type: 'run', autoPauseEnabled: true, weightKg: null, isIndoor: false });
    e.start(start);
    const events = parsed.points.flatMap((p) => e.addLocation(p));
    expect(events.some((x) => x.type === 'autoPaused')).toBe(true);
    expect(events.some((x) => x.type === 'autoResumed')).toBe(true);
    expect(events.filter((x) => x.type === 'announce')).toHaveLength(5);
    expect(events.filter((x) => x.type === 'rejected').length).toBeGreaterThan(10);
    const end = parsed.points[parsed.points.length - 1].timestamp;
    e.finish(end);
    const snap = e.snapshot(end);
    expect(snap.distanceM).toBeGreaterThan(5000);
    expect(snap.movingSec).toBeLessThan((end - start) / 1000 - 10); // 정지 구간이 빠졌다
  });
});

describe('GPX 가져오기', () => {
  const load = (name: string): string => readFileSync(join(__dirname, '..', '..', 'assets', 'gpx', `${name}.gpx`), 'utf8');

  it.each(['run', 'walk', 'ride'] as const)('%s: 평균 속도로 모드를 추정해 제안', (name) => {
    const p = previewGpx(load(name));
    expect(p.suggestedType).toBe(name);
    expect(p.points).toBeGreaterThan(100);
  });

  it('선택한 모드로 변환하면 노이즈 필터가 적용되고 GPX 이름을 제목으로 쓴다', () => {
    const { activity, points } = gpxToActivity(load('ride'), 'ride', 'imp', 70, null, 1);
    expect(activity.title).toBe('샘플 라이딩 15km');
    expect(activity.details.source).toBe('gpx');
    expect(activity.distanceM).toBeGreaterThan(14500);
    expect(activity.distanceM).toBeLessThan(15500);
    expect(points.every((p) => p.activityId === 'imp')).toBe(true);
    expect(() => gpxToActivity('<gpx></gpx>', 'run', 'x', null, null, 1)).toThrow('부족');
  });
});
