import { emptyDetails } from '../../../features/backup/backupFormat';
import { bool, bulkInsert, parseJson, type SqlContext } from './context';
import type { SqlValue } from '../../sqlDatabase';
import type { ActivityQuery, ActivityRepository } from '../types';
import type { Activity, ActivityDetails, ActivitySummary, ActivityType, BestEfforts, TrackPoint } from '../../../types';

interface ActivityRow {
  id: string;
  type: string;
  started_at: number;
  duration_sec: number;
  distance_m: number;
  avg_speed_mps: number;
  max_speed_mps: number;
  elevation_gain_m: number;
  steps: number | null;
  calories: number;
  is_indoor: number;
  gear_id: string | null;
  title: string;
  note: string;
  perceived_effort: number | null;
  best_efforts: string;
  max_speed_5s_mps: number;
  details?: string;
  created_at: number;
  updated_at: number;
}

interface PointRow {
  activity_id: string;
  timestamp: number;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;
  heart_rate: number | null;
  cadence: number | null;
  sensor_speed_mps: number | null;
}

const SUMMARY_COLUMNS =
  'id, type, started_at, duration_sec, distance_m, avg_speed_mps, max_speed_mps, elevation_gain_m, steps, calories, is_indoor, gear_id, title, note, perceived_effort, best_efforts, max_speed_5s_mps, created_at, updated_at';

const ALL_COLUMNS = SUMMARY_COLUMNS.replace('max_speed_5s_mps,', 'max_speed_5s_mps, details,');

const POINT_COLUMNS = ['activity_id', 'seq', 'timestamp', 'latitude', 'longitude', 'altitude', 'accuracy', 'heart_rate', 'cadence', 'sensor_speed_mps'];

function toSummary(r: ActivityRow): ActivitySummary {
  return {
    id: r.id,
    type: r.type as ActivityType,
    startedAt: r.started_at,
    durationSec: r.duration_sec,
    distanceM: r.distance_m,
    avgSpeedMps: r.avg_speed_mps,
    maxSpeedMps: r.max_speed_mps,
    elevationGainM: r.elevation_gain_m,
    steps: r.steps,
    calories: r.calories,
    isIndoor: r.is_indoor === 1,
    gearId: r.gear_id,
    title: r.title,
    note: r.note,
    perceivedEffort: r.perceived_effort,
    bestEfforts: parseJson<BestEfforts>(r.best_efforts, {}),
    maxSpeed5sMps: r.max_speed_5s_mps,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toActivity(r: ActivityRow): Activity {
  const { bestEfforts: _b, maxSpeed5sMps: _m, ...summary } = toSummary(r);
  return { ...summary, details: { ...emptyDetails(), ...parseJson<Partial<ActivityDetails>>(r.details ?? null, {}) } };
}

function activityParams(a: Activity): SqlValue[] {
  return [
    a.id,
    a.type,
    a.startedAt,
    a.durationSec,
    a.distanceM,
    a.avgSpeedMps,
    a.maxSpeedMps,
    a.elevationGainM,
    a.steps,
    a.calories,
    bool(a.isIndoor),
    a.gearId,
    a.title,
    a.note,
    a.perceivedEffort,
    JSON.stringify(a.details.bestEfforts),
    a.details.maxSpeed5sMps,
    JSON.stringify(a.details),
    a.createdAt,
    a.updatedAt,
  ];
}

function pointRow(p: TrackPoint, seq: number): SqlValue[] {
  return [p.activityId, seq, p.timestamp, p.latitude, p.longitude, p.altitude, p.accuracy, p.heartRate, p.cadence, p.sensorSpeedMps];
}

function toPoint(r: PointRow): TrackPoint {
  return {
    activityId: r.activity_id,
    timestamp: r.timestamp,
    latitude: r.latitude,
    longitude: r.longitude,
    altitude: r.altitude,
    accuracy: r.accuracy,
    heartRate: r.heart_rate,
    cadence: r.cadence,
    sensorSpeedMps: r.sensor_speed_mps,
  };
}

export class SqliteActivityRepository implements ActivityRepository {
  constructor(private readonly ctx: SqlContext) {}

  async save(activity: Activity, points: TrackPoint[]): Promise<void> {
    await this.ctx.tx(async () => {
      await this.ctx.run(`INSERT OR REPLACE INTO activities (${ALL_COLUMNS}) VALUES (${ALL_COLUMNS.split(',').map(() => '?').join(',')})`, activityParams(activity));
      await this.ctx.run('DELETE FROM track_points WHERE activity_id = ?', [activity.id]);
      await bulkInsert(this.ctx, 'track_points', POINT_COLUMNS, points.map((p, i) => pointRow({ ...p, activityId: activity.id }, i)));
    });
  }

  async update(activity: Activity): Promise<void> {
    await this.ctx.run(
      `UPDATE activities SET type=?, started_at=?, duration_sec=?, distance_m=?, avg_speed_mps=?, max_speed_mps=?, elevation_gain_m=?, steps=?, calories=?, is_indoor=?, gear_id=?, title=?, note=?, perceived_effort=?, best_efforts=?, max_speed_5s_mps=?, details=?, created_at=?, updated_at=? WHERE id=?`,
      [...activityParams(activity).slice(1), activity.id],
    );
  }

  async get(id: string): Promise<Activity | null> {
    const row = await this.ctx.first<ActivityRow>('SELECT * FROM activities WHERE id = ?', [id]);
    return row ? toActivity(row) : null;
  }

  async listSummaries(query: ActivityQuery = {}): Promise<ActivitySummary[]> {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (query.type) {
      where.push('type = ?');
      params.push(query.type);
    }
    if (query.from !== undefined) {
      where.push('started_at >= ?');
      params.push(query.from);
    }
    if (query.to !== undefined) {
      where.push('started_at < ?');
      params.push(query.to);
    }
    let sql = `SELECT ${SUMMARY_COLUMNS} FROM activities${where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY started_at DESC`;
    if (query.limit !== undefined) {
      sql += ' LIMIT ? OFFSET ?';
      params.push(query.limit, query.offset ?? 0);
    }
    const rows = await this.ctx.all<ActivityRow>(sql, params);
    return rows.map(toSummary);
  }

  async getTrackPoints(activityId: string): Promise<TrackPoint[]> {
    const rows = await this.ctx.all<PointRow>('SELECT * FROM track_points WHERE activity_id = ? ORDER BY seq', [activityId]);
    return rows.map(toPoint);
  }

  async replaceTrackPoints(activityId: string, points: TrackPoint[]): Promise<void> {
    await this.ctx.tx(async () => {
      await this.ctx.run('DELETE FROM track_points WHERE activity_id = ?', [activityId]);
      await bulkInsert(this.ctx, 'track_points', POINT_COLUMNS, points.map((p, i) => pointRow({ ...p, activityId }, i)));
    });
  }

  async appendTrackPoints(activityId: string, points: TrackPoint[], startSeq: number): Promise<void> {
    await this.ctx.tx(async () => {
      await bulkInsert(this.ctx, 'track_points', POINT_COLUMNS, points.map((p, i) => pointRow({ ...p, activityId }, startSeq + i)));
    });
  }

  async countTrackPoints(activityId: string): Promise<number> {
    const row = await this.ctx.first<{ n: number }>('SELECT COUNT(*) AS n FROM track_points WHERE activity_id = ?', [activityId]);
    return row?.n ?? 0;
  }

  async delete(id: string): Promise<void> {
    await this.ctx.tx(async () => {
      await this.ctx.run('DELETE FROM track_points WHERE activity_id = ?', [id]);
      await this.ctx.run('DELETE FROM segment_efforts WHERE activity_id = ?', [id]);
      await this.ctx.run('DELETE FROM activities WHERE id = ?', [id]);
    });
  }

  async listAll(): Promise<Activity[]> {
    const rows = await this.ctx.all<ActivityRow>('SELECT * FROM activities ORDER BY started_at', []);
    return rows.map(toActivity);
  }

  async listAllTrackPoints(): Promise<TrackPoint[]> {
    // 복구용 임시 세션 포인트는 백업 대상이 아니다(활동 테이블에 있는 것만)
    const rows = await this.ctx.all<PointRow>('SELECT tp.* FROM track_points tp INNER JOIN activities a ON a.id = tp.activity_id ORDER BY tp.activity_id, tp.seq', []);
    return rows.map(toPoint);
  }
}
