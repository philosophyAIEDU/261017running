import { ACTIVITY_CONFIGS } from '../activity/activityConfig';
import type { ActivityType, RawLocation, TrackPoint } from '../../types';

// GPX 1.1 내보내기/가져오기(순수 함수, 외부 XML 라이브러리 없이 처리).
// 심박/케이던스는 Garmin TrackPointExtension(gpxtpx:hr, gpxtpx:cad)을 사용한다.

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function toGpx(name: string, type: ActivityType, points: TrackPoint[]): string {
  const trkpts = points
    .map((p) => {
      const ext: string[] = [];
      if (p.heartRate !== null) ext.push(`<gpxtpx:hr>${Math.round(p.heartRate)}</gpxtpx:hr>`);
      if (p.cadence !== null) ext.push(`<gpxtpx:cad>${Math.round(p.cadence)}</gpxtpx:cad>`);
      const extXml = ext.length > 0 ? `<extensions><gpxtpx:TrackPointExtension>${ext.join('')}</gpxtpx:TrackPointExtension></extensions>` : '';
      const ele = p.altitude !== null ? `<ele>${p.altitude.toFixed(1)}</ele>` : '';
      return `      <trkpt lat="${p.latitude.toFixed(7)}" lon="${p.longitude.toFixed(7)}">${ele}<time>${new Date(p.timestamp).toISOString()}</time>${extXml}</trkpt>`;
    })
    .join('\n');
  const gpxType = ACTIVITY_CONFIGS[type].healthKitType.toLowerCase();
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RunWalkRide" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata><name>${escapeXml(name)}</name><time>${new Date(points[0]?.timestamp ?? Date.now()).toISOString()}</time></metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <type>${gpxType}</type>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

export interface ParsedGpx {
  name: string | null;
  typeHint: ActivityType | null; // <type> 태그로 알 수 있는 경우
  points: (RawLocation & { heartRate: number | null; cadence: number | null })[];
}

function tagValue(xml: string, tag: string): string | null {
  const m = new RegExp(`<(?:[a-zA-Z0-9]+:)?${tag}[^>]*>([^<]*)</(?:[a-zA-Z0-9]+:)?${tag}>`).exec(xml);
  return m ? m[1].trim() : null;
}

function attr(tag: string, name: string): number | null {
  const m = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`).exec(tag);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

const TYPE_HINTS: Record<string, ActivityType> = {
  running: 'run',
  run: 'run',
  walking: 'walk',
  walk: 'walk',
  hiking: 'walk',
  cycling: 'ride',
  biking: 'ride',
  ride: 'ride',
};

export function parseGpx(xml: string): ParsedGpx {
  if (!/<gpx[\s>]/.test(xml)) throw new Error('GPX 파일이 아닙니다.');
  const points: ParsedGpx['points'] = [];
  // 자기 닫힘 태그(<trkpt .../>)를 먼저 시도해야 다음 포인트까지 본문으로 먹지 않는다.
  const re = /<trkpt\b([^>]*?)\/>|<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g;
  let m: RegExpExecArray | null;
  let fallbackTime = 0;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1] ?? m[2] ?? '';
    const body = m[3] ?? '';
    const lat = attr(attrs, 'lat');
    const lon = attr(attrs, 'lon');
    if (lat === null || lon === null) continue;
    const timeText = tagValue(body, 'time');
    const ts = timeText ? Date.parse(timeText) : NaN;
    const ele = tagValue(body, 'ele');
    const hr = tagValue(body, 'hr');
    const cad = tagValue(body, 'cad');
    const hdop = tagValue(body, 'hdop');
    fallbackTime += 1000;
    points.push({
      timestamp: Number.isFinite(ts) ? ts : fallbackTime,
      latitude: lat,
      longitude: lon,
      altitude: ele !== null && Number.isFinite(Number(ele)) ? Number(ele) : null,
      // GPX에는 정확도(m)가 없다. hdop이 있으면 hdop × 5m로 근사하고, 없으면 양호한 값으로 가정한다.
      accuracy: hdop !== null && Number.isFinite(Number(hdop)) ? Number(hdop) * 5 : 5,
      speed: null,
      heartRate: hr !== null && Number.isFinite(Number(hr)) ? Number(hr) : null,
      cadence: cad !== null && Number.isFinite(Number(cad)) ? Number(cad) : null,
    });
  }
  const trk = /<trk>([\s\S]*?)<trkseg/.exec(xml)?.[1] ?? '';
  const typeText = tagValue(trk, 'type')?.toLowerCase() ?? null;
  return {
    name: tagValue(trk, 'name') ?? tagValue(xml, 'name'),
    typeHint: typeText !== null ? (TYPE_HINTS[typeText] ?? null) : null,
    points: points.sort((a, b) => a.timestamp - b.timestamp),
  };
}
