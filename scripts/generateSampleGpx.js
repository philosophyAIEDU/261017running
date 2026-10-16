// GPS 시뮬레이션용 샘플 GPX 생성 스크립트(노이즈 포함).
// 실행: node scripts/generateSampleGpx.js  →  assets/gpx/{run,walk,ride}.gpx
//
// 포함된 노이즈
//  - 정확도 불량 포인트: <hdop>가 크다(시뮬레이터는 accuracy = hdop × 5m로 변환) → 정확도 필터로 버려져야 함
//  - 순간이동 포인트: 정확도는 좋지만 수백 m 튄 좌표 → 속도 필터로 버려져야 함
//  - 고도 잡음: ±1.5m 랜덤 → 스무딩 + 3m 임계값으로 누적 상승에 반영되지 않아야 함
//  - 정지 구간: 신호 대기처럼 제자리에 머무는 구간 → 자동 일시정지 확인용
const fs = require('fs');
const path = require('path');

let seed = 42;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

const M_PER_DEG_LAT = 111320;
function offset(lat, lon, dx, dy) {
  return [lat + dy / M_PER_DEG_LAT, lon + dx / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180))];
}

// 여의도 한강공원 부근을 기준으로 한 루프(동서로 길쭉한 사각형)
function loopPosition(origin, distance, width, height) {
  const perimeter = 2 * (width + height);
  let d = distance % perimeter;
  let dx;
  let dy;
  if (d < width) [dx, dy] = [d, 0];
  else if ((d -= width) < height) [dx, dy] = [width, d];
  else if ((d -= height) < width) [dx, dy] = [width - d, height];
  else {
    d -= width;
    [dx, dy] = [0, height - d];
  }
  return offset(origin[0], origin[1], dx, dy);
}

function generate({ name, type, speed, intervalSec, totalM, width, height, hillAmp, stopAtM, stopSec, start }) {
  const origin = [37.5265, 126.9335];
  const points = [];
  let t = start;
  let d = 0;
  let stopped = false;
  let i = 0;
  while (d <= totalM) {
    const [lat, lon] = loopPosition(origin, d, width, height);
    const ele = 15 + hillAmp * Math.sin((d / 1500) * Math.PI) + (rand() - 0.5) * 3;
    let hdop = 1 + rand();
    let pLat = lat;
    let pLon = lon;
    if (i > 0 && i % 47 === 0) hdop = 8 + rand() * 4; // 정확도 불량
    if (i > 0 && i % 113 === 0) [pLat, pLon] = offset(lat, lon, 350, 250); // 순간이동
    points.push({ lat: pLat, lon: pLon, ele, time: t, hdop });
    i += 1;
    if (!stopped && d >= stopAtM) {
      stopped = true;
      for (let s = intervalSec; s <= stopSec; s += intervalSec) {
        t += intervalSec * 1000;
        const [sLat, sLon] = offset(lat, lon, (rand() - 0.5) * 1.5, (rand() - 0.5) * 1.5);
        points.push({ lat: sLat, lon: sLon, ele, time: t, hdop: 1.2 });
        i += 1;
      }
    }
    const v = speed * (0.85 + rand() * 0.3);
    d += v * intervalSec;
    t += intervalSec * 1000;
  }
  const trkpts = points
    .map((p) => `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}"><ele>${p.ele.toFixed(1)}</ele><time>${new Date(p.time).toISOString()}</time><hdop>${p.hdop.toFixed(1)}</hdop></trkpt>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="sample-generator" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <type>${type}</type>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

const outDir = path.join(__dirname, '..', 'assets', 'gpx');
fs.mkdirSync(outDir, { recursive: true });
const start = Date.UTC(2026, 9, 1, 22, 0, 0);
const samples = {
  run: generate({ name: '샘플 달리기 5km', type: 'running', speed: 3.0, intervalSec: 1, totalM: 5200, width: 1200, height: 300, hillAmp: 6, stopAtM: 2100, stopSec: 20, start }),
  walk: generate({ name: '샘플 산책 2.5km', type: 'walking', speed: 1.3, intervalSec: 3, totalM: 2500, width: 600, height: 200, hillAmp: 4, stopAtM: 1200, stopSec: 30, start }),
  ride: generate({ name: '샘플 라이딩 15km', type: 'cycling', speed: 7, intervalSec: 1, totalM: 15000, width: 2500, height: 500, hillAmp: 25, stopAtM: 6000, stopSec: 15, start }),
};
for (const [k, v] of Object.entries(samples)) {
  fs.writeFileSync(path.join(outDir, `${k}.gpx`), v);
  console.log(`wrote ${k}.gpx`);
}
