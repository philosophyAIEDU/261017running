import type { LiveMetric } from '../activity/activityConfig';
import type { EngineSnapshot } from './trackingEngine';
import { formatDistanceValue, formatDuration, formatNumber, formatPaceValue, formatSpeedValue, unitLabel } from '../../utils/format';
import type { DistanceUnit } from '../../types';

export interface MetricDisplay {
  key: LiveMetric;
  label: string;
  value: string;
  unit: string;
}

/** 기록 화면에 표시할 지표 값(모드 설정의 liveMetrics 순서대로) */
export function liveMetricDisplay(metric: LiveMetric, s: EngineSnapshot, unit: DistanceUnit): MetricDisplay {
  const perUnit = `/${unitLabel(unit)}`;
  const speedUnit = unit === 'km' ? 'km/h' : 'mph';
  switch (metric) {
    case 'duration':
      return { key: metric, label: '시간', value: formatDuration(s.movingSec), unit: '' };
    case 'distance':
      return { key: metric, label: '거리', value: formatDistanceValue(s.distanceM, unit), unit: unitLabel(unit) };
    case 'currentPace':
      return { key: metric, label: '현재 페이스', value: formatPaceValue(s.currentSpeedMps, unit), unit: perUnit };
    case 'avgPace':
      return { key: metric, label: '평균 페이스', value: formatPaceValue(s.avgSpeedMps, unit), unit: perUnit };
    case 'currentSpeed':
      return { key: metric, label: '현재 속도', value: formatSpeedValue(s.currentSpeedMps, unit), unit: speedUnit };
    case 'avgSpeed':
      return { key: metric, label: '평균 속도', value: formatSpeedValue(s.avgSpeedMps, unit), unit: speedUnit };
    case 'maxSpeed':
      return { key: metric, label: '최고 속도', value: formatSpeedValue(s.maxSpeedMps, unit), unit: speedUnit };
    case 'steps':
      return { key: metric, label: '걸음 수', value: s.steps !== null ? formatNumber(s.steps) : '--', unit: '보' };
    case 'elevation':
      return { key: metric, label: '누적 상승', value: String(Math.round(s.elevationGainM)), unit: 'm' };
    case 'heartRate':
      return { key: metric, label: '심박', value: s.heartRate !== null ? String(s.heartRate) : '--', unit: 'bpm' };
    case 'cadence':
      return { key: metric, label: '케이던스', value: s.cadence !== null ? String(s.cadence) : '--', unit: s.type === 'ride' ? 'rpm' : 'spm' };
    case 'calories':
      return { key: metric, label: '칼로리', value: String(s.calories), unit: 'kcal' };
  }
}

/**
 * 표시할 지표 목록. 센서가 없으면 심박/케이던스 칸을 숨겨 핵심 숫자를 크게 보여준다.
 * 실내 모드에서는 GPS 기반 지표 대신 시간/걸음 수/칼로리를 보여준다.
 */
export function visibleLiveMetrics(metrics: LiveMetric[], s: EngineSnapshot, isIndoor: boolean): LiveMetric[] {
  if (isIndoor) return s.steps !== null ? ['duration', 'steps', 'calories'] : ['duration', 'calories'];
  return metrics.filter((m) => (m !== 'heartRate' || s.heartRate !== null) && (m !== 'cadence' || s.cadence !== null));
}
