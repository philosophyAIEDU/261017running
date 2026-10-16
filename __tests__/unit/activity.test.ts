import { ACTIVITY_CONFIGS, ACTIVITY_TYPES, getActivityConfig, isActivityType } from '../../src/features/activity/activityConfig';
import { estimateActivityType, modeChangeQuestion, suggestModeChange } from '../../src/features/activity/modeDetection';
import { calculateCalories, interpolateMet } from '../../src/utils/calories';

describe('MET 칼로리', () => {
  const kmh = (v: number): number => v / 3.6;

  it('기준점 값', () => {
    expect(ACTIVITY_CONFIGS.walk.metByIntensity(kmh(4))).toBeCloseTo(3.0);
    expect(ACTIVITY_CONFIGS.walk.metByIntensity(kmh(5.5))).toBeCloseTo(4.3);
    expect(ACTIVITY_CONFIGS.run.metByIntensity(kmh(8))).toBeCloseTo(8.3);
    expect(ACTIVITY_CONFIGS.run.metByIntensity(kmh(10))).toBeCloseTo(9.8);
    expect(ACTIVITY_CONFIGS.run.metByIntensity(kmh(12))).toBeCloseTo(11.5);
    expect(ACTIVITY_CONFIGS.ride.metByIntensity(kmh(17))).toBeCloseTo(6.8);
    expect(ACTIVITY_CONFIGS.ride.metByIntensity(kmh(25))).toBeCloseTo(10.0);
  });

  it('사이 값은 선형 보간, 범위 밖은 끝값', () => {
    expect(ACTIVITY_CONFIGS.run.metByIntensity(kmh(9))).toBeCloseTo(9.05);
    expect(ACTIVITY_CONFIGS.ride.metByIntensity(kmh(20.5))).toBeCloseTo(7.4);
    expect(ACTIVITY_CONFIGS.run.metByIntensity(kmh(5))).toBeCloseTo(8.3);
    expect(ACTIVITY_CONFIGS.run.metByIntensity(kmh(20))).toBeCloseTo(11.5);
    expect(interpolateMet([], 10)).toBe(0);
  });

  it('kcal = MET × 체중 × 시간, 체중 없으면 65kg', () => {
    expect(calculateCalories(9.8, 70, 3600)).toBe(686);
    expect(calculateCalories(9.8, null, 1800)).toBe(Math.round(9.8 * 65 * 0.5));
    expect(calculateCalories(3, 0, 3600)).toBe(195);
  });
});

describe('활동 모드 설정', () => {
  it('세 모드와 표의 값', () => {
    expect(ACTIVITY_TYPES).toEqual(['run', 'walk', 'ride']);
    expect(ACTIVITY_CONFIGS.run.gps).toEqual({ timeIntervalMs: 1000, distanceIntervalM: 5 });
    expect(ACTIVITY_CONFIGS.walk.gps).toEqual({ timeIntervalMs: 3000, distanceIntervalM: 5 });
    expect(ACTIVITY_CONFIGS.ride.gps).toEqual({ timeIntervalMs: 1000, distanceIntervalM: 10 });
    expect(ACTIVITY_CONFIGS.ride.announceEveryKm).toBe(5);
    expect(ACTIVITY_CONFIGS.ride.primaryMetric).toBe('speed');
    expect(getActivityConfig('walk').label).toBe('산책');
    expect(isActivityType('swim')).toBe(false);
    expect(isActivityType('ride')).toBe(true);
  });
});

describe('모드 오선택 감지', () => {
  it('평균 속도로 모드 추정', () => {
    expect(estimateActivityType(1.2)).toBe('walk');
    expect(estimateActivityType(1.8)).toBe('walk');
    expect(estimateActivityType(3)).toBe('run');
    expect(estimateActivityType(8)).toBe('ride');
    expect(estimateActivityType(30)).toBeNull();
    expect(estimateActivityType(0)).toBeNull();
  });

  it('범위를 벗어나면 다른 모드 제안', () => {
    expect(suggestModeChange('run', 7.5, 20000, 2700)).toBe('ride');
    expect(suggestModeChange('ride', 1.2, 3000, 2500)).toBe('walk');
    expect(suggestModeChange('walk', 3.2, 5000, 1560)).toBe('run');
    expect(suggestModeChange('run', 3, 5000, 1660)).toBeNull();
    expect(suggestModeChange('run', 9, 100, 60)).toBeNull(); // 너무 짧은 기록은 판정 안 함
    expect(modeChangeQuestion('ride')).toBe('자전거 기록으로 바꿀까요?');
  });
});
