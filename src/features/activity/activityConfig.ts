import { interpolateMet, type MetTable } from '../../utils/calories';
import type { ActivityType, BestEffortKey, GearKind } from '../../types';

// 모드별 차이는 이 파일의 설정 객체로만 표현한다.
// 트래킹 엔진, 화면, 음성 안내, PR 탐지, 레벨 등은 모두 이 설정을 읽어 동작한다.
// 새 모드를 추가하려면 ActivityType에 값을 추가하고 ACTIVITY_CONFIGS에 항목을 하나 더 넣으면 된다.

export type SecondaryMetric =
  | 'distance'
  | 'duration'
  | 'steps'
  | 'elevation'
  | 'calories'
  | 'heartRate'
  | 'cadence';

export type LiveMetric =
  | 'duration'
  | 'distance'
  | 'currentPace'
  | 'avgPace'
  | 'currentSpeed'
  | 'avgSpeed'
  | 'maxSpeed'
  | 'steps'
  | 'elevation'
  | 'heartRate'
  | 'cadence'
  | 'calories';


export interface ActivityConfig {
  type: ActivityType;
  label: string; // '달리기' | '산책' | '자전거'
  icon: string;
  color: string;
  colorDark: string;
  primaryMetric: 'pace' | 'speed';
  secondaryMetrics: SecondaryMetric[];
  /** 기록 중 화면에 보여줄 지표(순서대로). */
  liveMetrics: LiveMetric[];
  gps: { timeIntervalMs: number; distanceIntervalM: number };
  filter: { maxAccuracyM: number; maxSpeedMps: number }; // 노이즈 판정 기준
  autoPause: { speedBelowMps: number; durationSec: number };
  announceEveryKm: number;
  splitEveryKm: number;
  metTable: MetTable;
  metByIntensity: (speedMps: number) => number; // 칼로리 계산용 MET
  plausibleAvgSpeedMps: [number, number]; // 모드 오선택 감지 범위
  typicalSpeedMps: number; // 범위가 겹칠 때 모드 추정에 사용
  usesPedometer: boolean;
  supportsIntervals: boolean;
  supportsLandscape: boolean;
  voiceOnlyWhileMoving: boolean; // 주행 중 화면 조작 대신 음성으로 모든 정보를 전달
  distancePrKeys: BestEffortKey[];
  extraPrKeys: ('longestDistance' | 'longestDuration' | 'mostDailySteps' | 'maxSpeed' | 'maxElevationGain')[];
  levelDistanceKm: number; // 모드별 거리 레벨 1단계 크기
  gearKind: GearKind;
  healthKitType: 'Running' | 'Walking' | 'Cycling';
  healthConnectType: 'RUNNING' | 'WALKING' | 'BIKING';
  indoorLabel: string;
}

function config(c: Omit<ActivityConfig, 'metByIntensity'>): ActivityConfig {
  return { ...c, metByIntensity: (speedMps: number): number => interpolateMet(c.metTable, speedMps * 3.6) };
}

export const ACTIVITY_CONFIGS: Record<ActivityType, ActivityConfig> = {
  run: config({
    type: 'run',
    label: '달리기',
    icon: '🏃',
    color: '#F2600C',
    colorDark: '#FF8A4C',
    primaryMetric: 'pace',
    secondaryMetrics: ['distance', 'duration', 'calories', 'heartRate', 'cadence', 'elevation'],
    liveMetrics: ['duration', 'distance', 'currentPace', 'avgPace', 'heartRate'],
    gps: { timeIntervalMs: 1000, distanceIntervalM: 5 },
    filter: { maxAccuracyM: 20, maxSpeedMps: 12 },
    autoPause: { speedBelowMps: 0.5, durationSec: 5 },
    announceEveryKm: 1,
    splitEveryKm: 1,
    metTable: [
      [8, 8.3],
      [10, 9.8],
      [12, 11.5],
    ],
    plausibleAvgSpeedMps: [1.5, 7],
    typicalSpeedMps: 2.9,
    usesPedometer: true,
    supportsIntervals: true,
    supportsLandscape: false,
    voiceOnlyWhileMoving: false,
    distancePrKeys: ['1k', '5k', '10k', 'half', 'full'],
    extraPrKeys: ['longestDistance'],
    levelDistanceKm: 100,
    gearKind: 'shoe',
    healthKitType: 'Running',
    healthConnectType: 'RUNNING',
    indoorLabel: '트레드밀',
  }),
  walk: config({
    type: 'walk',
    label: '산책',
    icon: '🚶',
    color: '#1E9E5A',
    colorDark: '#4CD38A',
    primaryMetric: 'pace',
    secondaryMetrics: ['distance', 'duration', 'steps', 'calories', 'elevation'],
    liveMetrics: ['duration', 'distance', 'steps', 'avgPace', 'heartRate'],
    gps: { timeIntervalMs: 3000, distanceIntervalM: 5 },
    filter: { maxAccuracyM: 20, maxSpeedMps: 4 },
    autoPause: { speedBelowMps: 0.2, durationSec: 10 },
    announceEveryKm: 1,
    splitEveryKm: 1,
    metTable: [
      [4, 3.0],
      [5.5, 4.3],
    ],
    plausibleAvgSpeedMps: [0.5, 2.2],
    typicalSpeedMps: 1.3,
    usesPedometer: true,
    supportsIntervals: false,
    supportsLandscape: false,
    voiceOnlyWhileMoving: false,
    distancePrKeys: [],
    extraPrKeys: ['longestDistance', 'longestDuration', 'mostDailySteps'],
    levelDistanceKm: 100,
    gearKind: 'shoe',
    healthKitType: 'Walking',
    healthConnectType: 'WALKING',
    indoorLabel: '실내 걷기',
  }),
  ride: config({
    type: 'ride',
    label: '자전거',
    icon: '🚴',
    color: '#1F6FEB',
    colorDark: '#5C9DFF',
    primaryMetric: 'speed',
    secondaryMetrics: ['distance', 'duration', 'elevation', 'calories', 'heartRate', 'cadence'],
    liveMetrics: ['duration', 'distance', 'currentSpeed', 'avgSpeed', 'maxSpeed', 'elevation', 'heartRate', 'cadence'],
    gps: { timeIntervalMs: 1000, distanceIntervalM: 10 },
    filter: { maxAccuracyM: 25, maxSpeedMps: 25 },
    autoPause: { speedBelowMps: 1.5, durationSec: 3 },
    announceEveryKm: 5,
    splitEveryKm: 5,
    metTable: [
      [16, 6.8],
      [19, 6.8],
      [22, 8.0],
      [25, 10.0],
    ],
    plausibleAvgSpeedMps: [3, 20],
    typicalSpeedMps: 6.5,
    usesPedometer: false,
    supportsIntervals: true,
    supportsLandscape: true,
    voiceOnlyWhileMoving: true,
    distancePrKeys: ['20k', '40k', '100k'],
    extraPrKeys: ['maxSpeed', 'longestDistance', 'maxElevationGain'],
    levelDistanceKm: 500,
    gearKind: 'bike',
    healthKitType: 'Cycling',
    healthConnectType: 'BIKING',
    indoorLabel: '실내 자전거',
  }),
};

export const ACTIVITY_TYPES: ActivityType[] = Object.keys(ACTIVITY_CONFIGS) as ActivityType[];

export function getActivityConfig(type: ActivityType): ActivityConfig {
  return ACTIVITY_CONFIGS[type];
}

export function isActivityType(value: unknown): value is ActivityType {
  return typeof value === 'string' && value in ACTIVITY_CONFIGS;
}
