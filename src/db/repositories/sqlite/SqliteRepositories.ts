import { SqliteActivityRepository } from './SqliteActivityRepository';
import { bool, parseJson, SqlContext } from './context';
import type { SqlDatabase } from '../../sqlDatabase';
import type {
  BadgeRepository,
  GearRepository,
  GoalRepository,
  PlanRepository,
  RecoveryRepository,
  RecoverySnapshot,
  Repositories,
  SegmentRepository,
  SettingsRepository,
} from '../types';
import type {
  ActivityType,
  AppSettings,
  EarnedBadge,
  Gear,
  GearComponent,
  GearKind,
  Goal,
  GoalMetric,
  GoalPeriod,
  LatLng,
  PlanProgress,
  Segment,
  SegmentEffort,
} from '../../../types';

interface GearRow {
  id: string;
  kind: string;
  name: string;
  brand: string;
  activity_types: string;
  initial_distance_m: number;
  retire_at_m: number;
  retired: number;
  created_at: number;
  updated_at: number;
}

interface ComponentRow {
  id: string;
  gear_id: string;
  name: string;
  installed_at_gear_distance_m: number;
  replace_after_m: number;
  created_at: number;
  updated_at: number;
}

class SqliteGearRepository implements GearRepository {
  constructor(private readonly ctx: SqlContext) {}

  private toGear(r: GearRow): Gear {
    return {
      id: r.id,
      kind: r.kind as GearKind,
      name: r.name,
      brand: r.brand,
      activityTypes: parseJson<ActivityType[]>(r.activity_types, []),
      initialDistanceM: r.initial_distance_m,
      retireAtM: r.retire_at_m,
      retired: r.retired === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async list(): Promise<Gear[]> {
    return (await this.ctx.all<GearRow>('SELECT * FROM gear ORDER BY retired, created_at DESC')).map((r) => this.toGear(r));
  }

  async get(id: string): Promise<Gear | null> {
    const r = await this.ctx.first<GearRow>('SELECT * FROM gear WHERE id = ?', [id]);
    return r ? this.toGear(r) : null;
  }

  async save(g: Gear): Promise<void> {
    await this.ctx.run(
      'INSERT OR REPLACE INTO gear (id, kind, name, brand, activity_types, initial_distance_m, retire_at_m, retired, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [g.id, g.kind, g.name, g.brand, JSON.stringify(g.activityTypes), g.initialDistanceM, g.retireAtM, bool(g.retired), g.createdAt, g.updatedAt],
    );
  }

  async delete(id: string): Promise<void> {
    await this.ctx.tx(async () => {
      await this.ctx.run('DELETE FROM gear_components WHERE gear_id = ?', [id]);
      await this.ctx.run('UPDATE activities SET gear_id = NULL WHERE gear_id = ?', [id]);
      await this.ctx.run('DELETE FROM gear WHERE id = ?', [id]);
    });
  }

  async listComponents(gearId?: string): Promise<GearComponent[]> {
    const rows = gearId
      ? await this.ctx.all<ComponentRow>('SELECT * FROM gear_components WHERE gear_id = ? ORDER BY created_at', [gearId])
      : await this.ctx.all<ComponentRow>('SELECT * FROM gear_components ORDER BY created_at');
    return rows.map((r) => ({
      id: r.id,
      gearId: r.gear_id,
      name: r.name,
      installedAtGearDistanceM: r.installed_at_gear_distance_m,
      replaceAfterM: r.replace_after_m,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async saveComponent(c: GearComponent): Promise<void> {
    await this.ctx.run(
      'INSERT OR REPLACE INTO gear_components (id, gear_id, name, installed_at_gear_distance_m, replace_after_m, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
      [c.id, c.gearId, c.name, c.installedAtGearDistanceM, c.replaceAfterM, c.createdAt, c.updatedAt],
    );
  }

  async deleteComponent(id: string): Promise<void> {
    await this.ctx.run('DELETE FROM gear_components WHERE id = ?', [id]);
  }
}

interface GoalRow {
  id: string;
  activity_type: string | null;
  period: string;
  metric: string;
  target: number;
  created_at: number;
  updated_at: number;
}

class SqliteGoalRepository implements GoalRepository {
  constructor(private readonly ctx: SqlContext) {}

  async list(): Promise<Goal[]> {
    const rows = await this.ctx.all<GoalRow>('SELECT * FROM goals ORDER BY created_at');
    return rows.map((r) => ({
      id: r.id,
      activityType: r.activity_type as ActivityType | null,
      period: r.period as GoalPeriod,
      metric: r.metric as GoalMetric,
      target: r.target,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async save(g: Goal): Promise<void> {
    await this.ctx.run('INSERT OR REPLACE INTO goals (id, activity_type, period, metric, target, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', [
      g.id,
      g.activityType,
      g.period,
      g.metric,
      g.target,
      g.createdAt,
      g.updatedAt,
    ]);
  }

  async delete(id: string): Promise<void> {
    await this.ctx.run('DELETE FROM goals WHERE id = ?', [id]);
  }
}

interface BadgeRow {
  id: string;
  badge_id: string;
  earned_at: number;
  activity_id: string | null;
  created_at: number;
  updated_at: number;
}

class SqliteBadgeRepository implements BadgeRepository {
  constructor(private readonly ctx: SqlContext) {}

  async list(): Promise<EarnedBadge[]> {
    const rows = await this.ctx.all<BadgeRow>('SELECT * FROM badges ORDER BY earned_at DESC');
    return rows.map((r) => ({ id: r.id, badgeId: r.badge_id, earnedAt: r.earned_at, activityId: r.activity_id, createdAt: r.created_at, updatedAt: r.updated_at }));
  }

  async award(b: EarnedBadge): Promise<void> {
    // 같은 배지는 한 번만(badge_id UNIQUE)
    await this.ctx.run('INSERT OR IGNORE INTO badges (id, badge_id, earned_at, activity_id, created_at, updated_at) VALUES (?,?,?,?,?,?)', [
      b.id,
      b.badgeId,
      b.earnedAt,
      b.activityId,
      b.createdAt,
      b.updatedAt,
    ]);
  }
}

interface SegmentRow {
  id: string;
  name: string;
  start_lat: number;
  start_lon: number;
  end_lat: number;
  end_lon: number;
  distance_m: number;
  path: string;
  source_activity_id: string;
  created_at: number;
  updated_at: number;
}

interface EffortRow {
  id: string;
  segment_id: string;
  activity_id: string;
  activity_type: string;
  started_at: number;
  elapsed_sec: number;
  distance_m: number;
  created_at: number;
  updated_at: number;
}

function toEffort(r: EffortRow): SegmentEffort {
  return {
    id: r.id,
    segmentId: r.segment_id,
    activityId: r.activity_id,
    activityType: r.activity_type as ActivityType,
    startedAt: r.started_at,
    elapsedSec: r.elapsed_sec,
    distanceM: r.distance_m,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

class SqliteSegmentRepository implements SegmentRepository {
  constructor(private readonly ctx: SqlContext) {}

  private toSegment(r: SegmentRow): Segment {
    return {
      id: r.id,
      name: r.name,
      start: { latitude: r.start_lat, longitude: r.start_lon },
      end: { latitude: r.end_lat, longitude: r.end_lon },
      distanceM: r.distance_m,
      path: parseJson<LatLng[]>(r.path, []),
      sourceActivityId: r.source_activity_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async list(): Promise<Segment[]> {
    return (await this.ctx.all<SegmentRow>('SELECT * FROM segments ORDER BY created_at DESC')).map((r) => this.toSegment(r));
  }

  async get(id: string): Promise<Segment | null> {
    const r = await this.ctx.first<SegmentRow>('SELECT * FROM segments WHERE id = ?', [id]);
    return r ? this.toSegment(r) : null;
  }

  async save(s: Segment): Promise<void> {
    await this.ctx.run(
      'INSERT OR REPLACE INTO segments (id, name, start_lat, start_lon, end_lat, end_lon, distance_m, path, source_activity_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [s.id, s.name, s.start.latitude, s.start.longitude, s.end.latitude, s.end.longitude, s.distanceM, JSON.stringify(s.path), s.sourceActivityId, s.createdAt, s.updatedAt],
    );
  }

  async delete(id: string): Promise<void> {
    await this.ctx.tx(async () => {
      await this.ctx.run('DELETE FROM segment_efforts WHERE segment_id = ?', [id]);
      await this.ctx.run('DELETE FROM segments WHERE id = ?', [id]);
    });
  }

  async listEfforts(segmentId?: string): Promise<SegmentEffort[]> {
    const rows = segmentId
      ? await this.ctx.all<EffortRow>('SELECT * FROM segment_efforts WHERE segment_id = ? ORDER BY elapsed_sec', [segmentId])
      : await this.ctx.all<EffortRow>('SELECT * FROM segment_efforts ORDER BY started_at');
    return rows.map(toEffort);
  }

  async listEffortsForActivity(activityId: string): Promise<SegmentEffort[]> {
    return (await this.ctx.all<EffortRow>('SELECT * FROM segment_efforts WHERE activity_id = ? ORDER BY started_at', [activityId])).map(toEffort);
  }

  async saveEfforts(efforts: SegmentEffort[]): Promise<void> {
    await this.ctx.tx(async () => {
      for (const e of efforts) {
        await this.ctx.run(
          'INSERT OR REPLACE INTO segment_efforts (id, segment_id, activity_id, activity_type, started_at, elapsed_sec, distance_m, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
          [e.id, e.segmentId, e.activityId, e.activityType, e.startedAt, e.elapsedSec, e.distanceM, e.createdAt, e.updatedAt],
        );
      }
    });
  }

  async deleteEffortsForActivity(activityId: string): Promise<void> {
    await this.ctx.run('DELETE FROM segment_efforts WHERE activity_id = ?', [activityId]);
  }
}

interface PlanRow {
  id: string;
  plan_id: string;
  started_at: number;
  completed_workout_ids: string;
  active: number;
  created_at: number;
  updated_at: number;
}

class SqlitePlanRepository implements PlanRepository {
  constructor(private readonly ctx: SqlContext) {}

  async list(): Promise<PlanProgress[]> {
    const rows = await this.ctx.all<PlanRow>('SELECT * FROM plan_progress ORDER BY started_at DESC');
    return rows.map((r) => ({
      id: r.id,
      planId: r.plan_id,
      startedAt: r.started_at,
      completedWorkoutIds: parseJson<string[]>(r.completed_workout_ids, []),
      active: r.active === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async save(p: PlanProgress): Promise<void> {
    await this.ctx.run('INSERT OR REPLACE INTO plan_progress (id, plan_id, started_at, completed_workout_ids, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', [
      p.id,
      p.planId,
      p.startedAt,
      JSON.stringify(p.completedWorkoutIds),
      bool(p.active),
      p.createdAt,
      p.updatedAt,
    ]);
  }

  async delete(id: string): Promise<void> {
    await this.ctx.run('DELETE FROM plan_progress WHERE id = ?', [id]);
  }
}

class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly ctx: SqlContext) {}

  async getAll(): Promise<Partial<AppSettings>> {
    const rows = await this.ctx.all<{ key: string; value: string }>('SELECT key, value FROM settings');
    const out: Record<string, unknown> = {};
    for (const r of rows) out[r.key] = parseJson<unknown>(r.value, null);
    return out as Partial<AppSettings>;
  }

  async set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    await this.ctx.run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?,?,?)', [key, JSON.stringify(value), Date.now()]);
  }

  async setMany(values: Partial<AppSettings>): Promise<void> {
    await this.ctx.tx(async () => {
      for (const [k, v] of Object.entries(values)) {
        if (v === undefined) continue;
        await this.ctx.run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?,?,?)', [k, JSON.stringify(v), Date.now()]);
      }
    });
  }
}

class SqliteRecoveryRepository implements RecoveryRepository {
  constructor(private readonly ctx: SqlContext) {}

  async get(): Promise<RecoverySnapshot | null> {
    const r = await this.ctx.first<{ id: string; state: string; saved_at: number }>('SELECT * FROM recovery_session LIMIT 1');
    return r ? { id: r.id, state: r.state, savedAt: r.saved_at } : null;
  }

  async save(s: RecoverySnapshot): Promise<void> {
    await this.ctx.tx(async () => {
      await this.ctx.run('DELETE FROM recovery_session WHERE id != ?', [s.id]);
      await this.ctx.run('INSERT OR REPLACE INTO recovery_session (id, state, saved_at) VALUES (?,?,?)', [s.id, s.state, s.savedAt]);
    });
  }

  async clear(): Promise<void> {
    await this.ctx.run('DELETE FROM recovery_session');
  }

  async discard(id: string): Promise<void> {
    await this.ctx.tx(async () => {
      await this.ctx.run('DELETE FROM track_points WHERE activity_id = ? AND activity_id NOT IN (SELECT id FROM activities)', [id]);
      await this.ctx.run('DELETE FROM recovery_session');
    });
  }
}

export function createSqliteRepositories(db: SqlDatabase): Repositories {
  const ctx = new SqlContext(db);
  return {
    activities: new SqliteActivityRepository(ctx),
    gear: new SqliteGearRepository(ctx),
    goals: new SqliteGoalRepository(ctx),
    badges: new SqliteBadgeRepository(ctx),
    segments: new SqliteSegmentRepository(ctx),
    plans: new SqlitePlanRepository(ctx),
    settings: new SqliteSettingsRepository(ctx),
    recovery: new SqliteRecoveryRepository(ctx),
    async clearAll(): Promise<void> {
      await ctx.tx(async () => {
        for (const table of ['track_points', 'activities', 'gear_components', 'gear', 'goals', 'badges', 'segment_efforts', 'segments', 'plan_progress', 'settings', 'recovery_session']) {
          await ctx.run(`DELETE FROM ${table}`);
        }
      });
    },
    async storageBytes(): Promise<number> {
      const count = await ctx.first<{ page_count: number }>('PRAGMA page_count');
      const size = await ctx.first<{ page_size: number }>('PRAGMA page_size');
      return (count?.page_count ?? 0) * (size?.page_size ?? 0);
    },
    transaction: (task: () => Promise<void>): Promise<void> => ctx.tx(task),
  };
}
