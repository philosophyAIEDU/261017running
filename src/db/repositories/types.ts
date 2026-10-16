import type {
  Activity,
  ActivitySummary,
  ActivityType,
  AppSettings,
  EarnedBadge,
  Gear,
  GearComponent,
  Goal,
  PlanProgress,
  Segment,
  SegmentEffort,
  TrackPoint,
} from '../../types';

// 화면과 로직은 이 인터페이스에만 의존한다. 지금은 SQLite 구현체만 있지만,
// 나중에 서버 동기화를 붙일 때 같은 인터페이스의 원격/동기화 구현체로 교체할 수 있다.

export interface ActivityQuery {
  type?: ActivityType | null;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

export interface ActivityRepository {
  /** 활동과 GPS 포인트를 한 트랜잭션으로 저장(포인트는 일괄 삽입) */
  save(activity: Activity, points: TrackPoint[]): Promise<void>;
  update(activity: Activity): Promise<void>;
  get(id: string): Promise<Activity | null>;
  /** 목록/통계용 요약(포인트·details 미포함) */
  listSummaries(query?: ActivityQuery): Promise<ActivitySummary[]>;
  getTrackPoints(activityId: string): Promise<TrackPoint[]>;
  replaceTrackPoints(activityId: string, points: TrackPoint[]): Promise<void>;
  appendTrackPoints(activityId: string, points: TrackPoint[], startSeq: number): Promise<void>;
  countTrackPoints(activityId: string): Promise<number>;
  delete(id: string): Promise<void>;
  listAll(): Promise<Activity[]>;
  listAllTrackPoints(): Promise<TrackPoint[]>;
}

export interface GearRepository {
  list(): Promise<Gear[]>;
  get(id: string): Promise<Gear | null>;
  save(gear: Gear): Promise<void>;
  delete(id: string): Promise<void>;
  listComponents(gearId?: string): Promise<GearComponent[]>;
  saveComponent(component: GearComponent): Promise<void>;
  deleteComponent(id: string): Promise<void>;
}

export interface GoalRepository {
  list(): Promise<Goal[]>;
  save(goal: Goal): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface BadgeRepository {
  list(): Promise<EarnedBadge[]>;
  award(badge: EarnedBadge): Promise<void>;
}

export interface SegmentRepository {
  list(): Promise<Segment[]>;
  get(id: string): Promise<Segment | null>;
  save(segment: Segment): Promise<void>;
  delete(id: string): Promise<void>;
  listEfforts(segmentId?: string): Promise<SegmentEffort[]>;
  listEffortsForActivity(activityId: string): Promise<SegmentEffort[]>;
  saveEfforts(efforts: SegmentEffort[]): Promise<void>;
  deleteEffortsForActivity(activityId: string): Promise<void>;
}

export interface PlanRepository {
  list(): Promise<PlanProgress[]>;
  save(progress: PlanProgress): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface SettingsRepository {
  getAll(): Promise<Partial<AppSettings>>;
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void>;
  setMany(values: Partial<AppSettings>): Promise<void>;
}

export interface RecoverySnapshot {
  id: string; // 진행 중 활동 id (포인트는 track_points에 같은 id로 저장)
  state: string; // 직렬화된 엔진 상태(JSON)
  savedAt: number;
}

export interface RecoveryRepository {
  get(): Promise<RecoverySnapshot | null>;
  save(snapshot: RecoverySnapshot): Promise<void>;
  /** 복구 정보만 지운다(활동을 저장한 경우 포인트는 유지) */
  clear(): Promise<void>;
  /** 복구 정보와 임시 포인트를 함께 지운다(기록을 버린 경우) */
  discard(id: string): Promise<void>;
}

export interface Repositories {
  activities: ActivityRepository;
  gear: GearRepository;
  goals: GoalRepository;
  badges: BadgeRepository;
  segments: SegmentRepository;
  plans: PlanRepository;
  settings: SettingsRepository;
  recovery: RecoveryRepository;
  /** 백업 복원 "모두 덮어쓰기"용: 모든 사용자 데이터 삭제 */
  clearAll(): Promise<void>;
  /** 앱 데이터(DB) 사용 용량(bytes) */
  storageBytes(): Promise<number>;
  /** 여러 저장 작업을 하나의 트랜잭션으로 묶는다 */
  transaction(task: () => Promise<void>): Promise<void>;
}
