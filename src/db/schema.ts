import type { SqlDatabase } from './sqlDatabase';

// 테이블 정의와 DB 마이그레이션.
// PRAGMA user_version으로 현재 스키마 버전을 기록하고, 앱 시작 시 부족한 마이그레이션을 순서대로 실행한다.
// 목록 화면은 activities(요약)만 읽고, GPS 포인트(track_points)는 상세 화면에서만 읽는다.

export const DB_NAME = 'activity.db';

const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    duration_sec INTEGER NOT NULL,
    distance_m REAL NOT NULL,
    avg_speed_mps REAL NOT NULL,
    max_speed_mps REAL NOT NULL,
    elevation_gain_m REAL NOT NULL,
    steps INTEGER,
    calories INTEGER NOT NULL,
    is_indoor INTEGER NOT NULL,
    gear_id TEXT,
    title TEXT NOT NULL,
    note TEXT NOT NULL,
    perceived_effort INTEGER,
    best_efforts TEXT NOT NULL,
    max_speed_5s_mps REAL NOT NULL,
    details TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_activities_started ON activities(started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type, started_at DESC);

  CREATE TABLE IF NOT EXISTS track_points (
    activity_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    altitude REAL,
    accuracy REAL NOT NULL,
    heart_rate REAL,
    cadence REAL,
    sensor_speed_mps REAL,
    PRIMARY KEY (activity_id, seq)
  );

  CREATE TABLE IF NOT EXISTS gear (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    activity_types TEXT NOT NULL,
    initial_distance_m REAL NOT NULL,
    retire_at_m REAL NOT NULL,
    retired INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gear_components (
    id TEXT PRIMARY KEY NOT NULL,
    gear_id TEXT NOT NULL,
    name TEXT NOT NULL,
    installed_at_gear_distance_m REAL NOT NULL,
    replace_after_m REAL NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY NOT NULL,
    activity_type TEXT,
    period TEXT NOT NULL,
    metric TEXT NOT NULL,
    target REAL NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS badges (
    id TEXT PRIMARY KEY NOT NULL,
    badge_id TEXT NOT NULL UNIQUE,
    earned_at INTEGER NOT NULL,
    activity_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS segments (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    start_lat REAL NOT NULL,
    start_lon REAL NOT NULL,
    end_lat REAL NOT NULL,
    end_lon REAL NOT NULL,
    distance_m REAL NOT NULL,
    path TEXT NOT NULL,
    source_activity_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS segment_efforts (
    id TEXT PRIMARY KEY NOT NULL,
    segment_id TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    elapsed_sec REAL NOT NULL,
    distance_m REAL NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_efforts_segment ON segment_efforts(segment_id, activity_type, elapsed_sec);
  CREATE INDEX IF NOT EXISTS idx_efforts_activity ON segment_efforts(activity_id);

  CREATE TABLE IF NOT EXISTS plan_progress (
    id TEXT PRIMARY KEY NOT NULL,
    plan_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    completed_workout_ids TEXT NOT NULL,
    active INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recovery_session (
    id TEXT PRIMARY KEY NOT NULL,
    state TEXT NOT NULL,
    saved_at INTEGER NOT NULL
  );
  `,
];

export const DB_SCHEMA_VERSION = MIGRATIONS.length;

export async function migrateDatabase(db: SqlDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v += 1) {
    await db.execAsync(MIGRATIONS[v]);
    await db.execAsync(`PRAGMA user_version = ${v + 1}`);
  }
}
