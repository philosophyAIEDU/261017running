// 앱 전역에서 사용하는 도메인 타입.
// 모든 저장 레코드는 id(UUID)와 createdAt/updatedAt(ms)을 가진다.

export type ActivityType = 'run' | 'walk' | 'ride';

export type DistanceUnit = 'km' | 'mi';

export type WorkoutKind = 'free' | 'target' | 'interval' | 'indoor';

export interface BaseRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
}

/** 일시정지 구간(ms, 벽시계 기준). 자동 일시정지는 느려지기 시작한 시점부터 소급 적용된다. */
export interface PauseInterval {
  start: number;
  end: number;
}

export interface Split {
  index: number; // 1부터
  distanceM: number; // 마지막 스플릿은 splitEveryKm보다 짧을 수 있음
  durationSec: number;
  avgSpeedMps: number;
  elevationGainM: number;
  avgHeartRate: number | null;
}

export interface StepSample {
  timestamp: number; // ms
  steps: number; // 활동 시작 이후 누적 걸음 수
}

/** 표준 거리별 활동 내 최고 기록(초). 키는 BEST_EFFORT_DISTANCES의 key. */
export type BestEfforts = Partial<Record<BestEffortKey, number>>;

export type BestEffortKey = '1k' | '5k' | '10k' | '20k' | '40k' | 'half' | 'full' | '100k';

export interface TargetSettings {
  distanceM: number | null;
  durationSec: number | null;
  speedMps: number | null; // 목표 페이스/속도 (내부적으로 속도로 저장)
}

export interface IntervalSettings {
  warmupSec: number;
  workSec: number;
  recoverSec: number;
  repeats: number;
  cooldownSec: number;
}

export interface WorkoutSettings {
  kind: WorkoutKind;
  target: TargetSettings | null;
  interval: IntervalSettings | null;
  planWorkoutId: string | null; // 훈련 플랜에서 시작한 경우
}

export interface ActivityDetails {
  workout: WorkoutSettings;
  pauses: PauseInterval[];
  splits: Split[];
  bestEfforts: BestEfforts;
  maxSpeed5sMps: number;
  elevationLossM: number;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  hrZonesSec: number[] | null; // Zone 1~5 체류 시간(초)
  avgCadence: number | null; // 달리기 spm, 자전거 rpm
  stepSamples: StepSample[];
  source: 'gps' | 'indoor' | 'gpx' | 'simulation';
  healthSynced: boolean;
}

export interface Activity extends BaseRecord {
  type: ActivityType;
  startedAt: number;
  durationSec: number; // 일시정지 시간 제외
  distanceM: number;
  avgSpeedMps: number; // 페이스/속도 표시는 화면에서 변환
  maxSpeedMps: number;
  elevationGainM: number;
  steps: number | null;
  calories: number;
  isIndoor: boolean;
  gearId: string | null;
  title: string;
  note: string;
  perceivedEffort: number | null; // 1~10
  details: ActivityDetails;
}

/** 목록/통계/배지 계산용 경량 요약(GPS 포인트 없음). */
export type ActivitySummary = Omit<Activity, 'details'> & {
  bestEfforts: BestEfforts;
  maxSpeed5sMps: number;
};

export interface TrackPoint {
  activityId: string;
  timestamp: number; // ms
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number; // m
  heartRate: number | null;
  cadence: number | null;
  sensorSpeedMps: number | null; // 자전거 속도 센서 값(있을 때)
}

/** 위치 소스(GPS/시뮬레이터)에서 들어오는 원시 위치. */
export interface RawLocation {
  timestamp: number;
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null; // m/s, 기기가 제공하는 값(음수/없음 가능)
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

export type PersonalRecordKey =
  | BestEffortKey
  | 'longestDistance'
  | 'longestDuration'
  | 'mostDailySteps'
  | 'maxSpeed'
  | 'maxElevationGain';

export interface PersonalRecord {
  activityType: ActivityType;
  key: PersonalRecordKey;
  label: string;
  value: number; // 시간 기록은 초, 거리는 m, 속도는 m/s, 걸음 수, 고도 m
  unit: 'sec' | 'm' | 'mps' | 'steps';
  activityId: string | null; // 하루 걸음 수는 여러 활동 합산이므로 null 가능
  achievedAt: number;
}

export interface Segment extends BaseRecord {
  name: string;
  start: LatLng;
  end: LatLng;
  distanceM: number;
  path: LatLng[]; // 표시용(간략화된 경로)
  sourceActivityId: string;
}

export interface SegmentEffort extends BaseRecord {
  segmentId: string;
  activityId: string;
  activityType: ActivityType;
  startedAt: number;
  elapsedSec: number;
  distanceM: number;
}

export type GearKind = 'shoe' | 'bike';

export interface Gear extends BaseRecord {
  kind: GearKind;
  name: string;
  brand: string;
  activityTypes: ActivityType[];
  initialDistanceM: number; // 앱 사용 전 이미 사용한 거리
  retireAtM: number; // 신발 교체 기준 (기본 700km)
  retired: boolean;
}

export interface GearComponent extends BaseRecord {
  gearId: string;
  name: string; // 체인, 타이어(앞) ...
  installedAtGearDistanceM: number; // 장착 당시 자전거 누적 거리
  replaceAfterM: number;
}

export type GoalPeriod = 'day' | 'week' | 'month' | 'year';
export type GoalMetric = 'distance' | 'steps';

export interface Goal extends BaseRecord {
  activityType: ActivityType | null; // null = 모든 모드 (걸음 수 목표)
  period: GoalPeriod;
  metric: GoalMetric;
  target: number; // 거리는 m
}

export interface EarnedBadge extends BaseRecord {
  badgeId: string;
  earnedAt: number;
  activityId: string | null;
}

export interface PlanProgress extends BaseRecord {
  planId: string;
  startedAt: number;
  completedWorkoutIds: string[];
  active: boolean;
}

export interface PrivacyZone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number; // 200~500
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
}

export type ThemePreference = 'system' | 'light' | 'dark';

export interface AppSettings {
  unit: DistanceUnit;
  weightKg: number | null;
  birthYear: number | null;
  maxHeartRate: number | null;
  heightCm: number | null;
  lastActivityType: ActivityType;
  autoPauseEnabled: Record<ActivityType, boolean>;
  voiceEnabled: boolean;
  theme: ThemePreference;
  highContrast: boolean;
  privacyZones: PrivacyZone[];
  emergencyContacts: EmergencyContact[];
  healthSyncEnabled: boolean;
  lastBackupAt: number | null;
  safetyNoticeAcknowledged: boolean;
  rideSafetyNoticeAcknowledged: boolean;
  simulationEnabled: boolean;
  simulationSpeed: number;
  defaultGearIds: Partial<Record<ActivityType, string>>;
  wheelCircumferenceMm: number;
  pairedSensors: PairedSensor[];
}

export type SensorKind = 'heartRate' | 'cyclingSpeedCadence';

export interface PairedSensor {
  id: string; // BLE device id
  name: string;
  kind: SensorKind;
}

export interface BackupData {
  activities: Activity[];
  trackPoints: TrackPoint[];
  gear: Gear[];
  gearComponents: GearComponent[];
  goals: Goal[];
  badges: EarnedBadge[];
  segments: Segment[];
  segmentEfforts: SegmentEffort[];
  planProgress: PlanProgress[];
  settings: Partial<AppSettings>;
}

export interface BackupFile {
  schemaVersion: number;
  exportedAt: number;
  appVersion: string;
  data: BackupData;
}
