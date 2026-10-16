import { isActivityType } from '../activity/activityConfig';
import type { Activity, ActivityDetails, BackupData, BackupFile, TrackPoint } from '../../types';

// 백업 파일 형식과 스키마 버전 마이그레이션(순수 함수).
//
// 버전 이력
//  v1: 초기 형식. activities에 details/updatedAt이 없고, trackPoints에 heartRate/cadence/sensorSpeedMps가 없다.
//      설정은 settings가 아니라 data.preferences에 { unit, weightKg }만 있었다. 장비 부품/플랜/구간 기록 없음.
//  v2: 현재 형식. 모든 레코드에 createdAt/updatedAt, 활동 details(스플릿, 일시정지, 최고 기록 등) 포함.
//
// 새 버전을 추가할 때는 BACKUP_SCHEMA_VERSION을 올리고 MIGRATIONS에 (이전 버전 → 다음 버전) 함수를 추가한다.
// 복원 시에는 파일 버전부터 현재 버전까지 마이그레이션을 차례로 적용한다.

export const BACKUP_SCHEMA_VERSION = 2;

export class BackupError extends Error {}

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function arr(v: unknown): Json[] {
  return Array.isArray(v) ? v.filter(isObject) : [];
}

export function emptyDetails(): ActivityDetails {
  return {
    workout: { kind: 'free', target: null, interval: null, planWorkoutId: null },
    pauses: [],
    splits: [],
    bestEfforts: {},
    maxSpeed5sMps: 0,
    elevationLossM: 0,
    avgHeartRate: null,
    maxHeartRate: null,
    hrZonesSec: null,
    avgCadence: null,
    stepSamples: [],
    source: 'gps',
    healthSynced: false,
  };
}

/** v1 → v2 */
function migrateV1(data: Json): Json {
  const activities = arr(data.activities).map((a) => ({
    ...a,
    updatedAt: typeof a.updatedAt === 'number' ? a.updatedAt : (a.createdAt ?? a.startedAt),
    details: { ...emptyDetails(), maxSpeed5sMps: typeof a.maxSpeedMps === 'number' ? a.maxSpeedMps : 0 },
  }));
  const trackPoints = arr(data.trackPoints).map((p) => ({ heartRate: null, cadence: null, sensorSpeedMps: null, ...p }));
  const prefs = isObject(data.preferences) ? data.preferences : {};
  const { preferences: _dropped, ...rest } = data;
  return {
    ...rest,
    activities,
    trackPoints,
    gear: arr(data.gear).map((g) => ({ activityTypes: g.kind === 'bike' ? ['ride'] : ['run', 'walk'], initialDistanceM: 0, retireAtM: 700000, retired: false, brand: '', ...g, updatedAt: g.updatedAt ?? g.createdAt })),
    gearComponents: [],
    goals: arr(data.goals).map((g) => ({ ...g, updatedAt: g.updatedAt ?? g.createdAt })),
    badges: arr(data.badges).map((b) => ({ activityId: null, ...b, createdAt: b.createdAt ?? b.earnedAt, updatedAt: b.updatedAt ?? b.earnedAt })),
    segments: [],
    segmentEfforts: [],
    planProgress: [],
    settings: { ...prefs },
  };
}

const MIGRATIONS: Record<number, (data: Json) => Json> = {
  1: migrateV1,
};

/** 파일 텍스트를 읽어 현재 스키마의 BackupFile로 변환한다. 형식 오류는 BackupError. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('백업 파일을 읽을 수 없습니다(JSON 형식 오류).');
  }
  if (!isObject(raw) || typeof raw.schemaVersion !== 'number' || !isObject(raw.data)) {
    throw new BackupError('이 앱의 백업 파일이 아닙니다.');
  }
  const version = raw.schemaVersion;
  if (version > BACKUP_SCHEMA_VERSION) {
    throw new BackupError(`더 새로운 앱 버전에서 만든 백업입니다(v${version}). 앱을 업데이트해 주세요.`);
  }
  if (version < 1) throw new BackupError('지원하지 않는 백업 버전입니다.');
  let data = raw.data;
  for (let v = version; v < BACKUP_SCHEMA_VERSION; v += 1) {
    const migrate = MIGRATIONS[v];
    if (!migrate) throw new BackupError(`v${v} 백업을 변환할 수 없습니다.`);
    data = migrate(data);
  }
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : 0,
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : 'unknown',
    data: validateData(data),
  };
}

function validateData(d: Json): BackupData {
  const activities = arr(d.activities) as unknown as Activity[];
  for (const a of activities) {
    if (typeof a.id !== 'string' || !isActivityType(a.type) || typeof a.startedAt !== 'number') {
      throw new BackupError('백업 파일의 활동 데이터가 손상되었습니다.');
    }
    a.details = { ...emptyDetails(), ...(isObject(a.details) ? (a.details as ActivityDetails) : {}) };
  }
  const trackPoints = arr(d.trackPoints) as unknown as TrackPoint[];
  return {
    activities,
    trackPoints,
    gear: arr(d.gear) as unknown as BackupData['gear'],
    gearComponents: arr(d.gearComponents) as unknown as BackupData['gearComponents'],
    goals: arr(d.goals) as unknown as BackupData['goals'],
    badges: arr(d.badges) as unknown as BackupData['badges'],
    segments: arr(d.segments) as unknown as BackupData['segments'],
    segmentEfforts: arr(d.segmentEfforts) as unknown as BackupData['segmentEfforts'],
    planProgress: arr(d.planProgress) as unknown as BackupData['planProgress'],
    settings: isObject(d.settings) ? (d.settings as BackupData['settings']) : {},
  };
}

export function createBackupFile(data: BackupData, appVersion: string, now: number): BackupFile {
  return { schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: now, appVersion, data };
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const ids = new Set(existing.map((e) => e.id));
  return [...existing, ...incoming.filter((i) => !ids.has(i.id))];
}

/**
 * "기존 데이터에 합치기": id 기준으로 이미 있는 레코드는 건너뛴다.
 * GPS 포인트는 id가 없으므로, 새로 추가되는 활동의 포인트만 가져온다(같은 활동 포인트 중복 방지).
 * 설정은 기존 값을 유지하고 비어 있는 항목만 백업 값으로 채운다.
 */
export function mergeBackupData(existing: BackupData, incoming: BackupData): BackupData {
  const existingActivityIds = new Set(existing.activities.map((a) => a.id));
  const newActivityIds = new Set(incoming.activities.filter((a) => !existingActivityIds.has(a.id)).map((a) => a.id));
  const settings: BackupData['settings'] = { ...incoming.settings };
  for (const [k, v] of Object.entries(existing.settings)) {
    if (v !== undefined && v !== null) (settings as Json)[k] = v;
  }
  return {
    activities: mergeById(existing.activities, incoming.activities),
    trackPoints: [...existing.trackPoints, ...incoming.trackPoints.filter((p) => newActivityIds.has(p.activityId))],
    gear: mergeById(existing.gear, incoming.gear),
    gearComponents: mergeById(existing.gearComponents, incoming.gearComponents),
    goals: mergeById(existing.goals, incoming.goals),
    badges: mergeBadges(existing.badges, incoming.badges),
    segments: mergeById(existing.segments, incoming.segments),
    segmentEfforts: mergeById(existing.segmentEfforts, incoming.segmentEfforts),
    planProgress: mergeById(existing.planProgress, incoming.planProgress),
    settings,
  };
}

/** 같은 배지를 두 번 받지 않도록 badgeId 기준으로도 중복을 제거한다. */
function mergeBadges(existing: BackupData['badges'], incoming: BackupData['badges']): BackupData['badges'] {
  const have = new Set(existing.map((b) => b.badgeId));
  return mergeById(existing, incoming.filter((b) => !have.has(b.badgeId)));
}
