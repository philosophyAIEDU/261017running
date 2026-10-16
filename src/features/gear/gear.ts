import type { ActivitySummary, ActivityType, Gear, GearComponent, GearKind } from '../../types';

export const SHOE_RETIRE_DEFAULT_M = 700_000; // 600~800km 사이 기본값
export const SHOE_WARNING_START_M = 600_000;

export interface ComponentTemplate {
  name: string;
  replaceAfterM: number;
}

/** 자전거 등록 시 기본으로 추가하는 부품(사용자가 기준 거리 수정 가능) */
export const DEFAULT_BIKE_COMPONENTS: ComponentTemplate[] = [
  { name: '체인', replaceAfterM: 3_000_000 },
  { name: '타이어(앞)', replaceAfterM: 5_000_000 },
  { name: '타이어(뒤)', replaceAfterM: 5_000_000 },
  { name: '브레이크 패드', replaceAfterM: 2_000_000 },
  { name: '카세트', replaceAfterM: 10_000_000 },
];

export function gearKindFor(type: ActivityType): GearKind {
  return type === 'ride' ? 'bike' : 'shoe';
}

/** 장비 누적 거리 = 앱 사용 전 거리 + 이 장비로 기록한 활동 거리 */
export function gearDistance(gear: Gear, activities: ActivitySummary[]): number {
  return gear.initialDistanceM + activities.filter((a) => a.gearId === gear.id).reduce((acc, a) => acc + a.distanceM, 0);
}

export function componentDistance(component: GearComponent, gearTotalM: number): number {
  return Math.max(0, gearTotalM - component.installedAtGearDistanceM);
}

export type WearLevel = 'ok' | 'warning' | 'replace';

/** 사용 비율 80%부터 주의, 100% 이상이면 교체 */
export function wearLevel(usedM: number, limitM: number): WearLevel {
  if (limitM <= 0) return 'ok';
  const ratio = usedM / limitM;
  if (ratio >= 1) return 'replace';
  if (ratio >= 0.8) return 'warning';
  return 'ok';
}

export function shoeWearLevel(usedM: number, retireAtM: number): WearLevel {
  if (usedM >= retireAtM) return 'replace';
  if (usedM >= Math.min(SHOE_WARNING_START_M, retireAtM * 0.85)) return 'warning';
  return 'ok';
}

export interface GearAlert {
  gearId: string;
  componentId: string | null;
  message: string;
  level: WearLevel;
}

export function gearAlerts(gearList: Gear[], components: GearComponent[], activities: ActivitySummary[]): GearAlert[] {
  const alerts: GearAlert[] = [];
  for (const g of gearList) {
    if (g.retired) continue;
    const total = gearDistance(g, activities);
    if (g.kind === 'shoe') {
      const level = shoeWearLevel(total, g.retireAtM);
      if (level !== 'ok') {
        alerts.push({
          gearId: g.id,
          componentId: null,
          level,
          message: level === 'replace' ? `${g.name} 신발이 ${Math.round(total / 1000)}km를 넘었어요. 교체를 권장합니다.` : `${g.name} 신발이 ${Math.round(total / 1000)}km예요. 곧 교체 시기입니다.`,
        });
      }
    } else {
      for (const c of components.filter((x) => x.gearId === g.id)) {
        const used = componentDistance(c, total);
        const level = wearLevel(used, c.replaceAfterM);
        if (level !== 'ok') {
          alerts.push({
            gearId: g.id,
            componentId: c.id,
            level,
            message: `${g.name}의 ${c.name}: ${Math.round(used / 1000)}km / ${Math.round(c.replaceAfterM / 1000)}km${level === 'replace' ? ' — 교체하세요' : ''}`,
          });
        }
      }
    }
  }
  return alerts;
}

/** 활동에 기본 장비를 자동 지정: 설정의 기본 장비 → 해당 모드를 지원하는 유일한 활성 장비 */
export function pickDefaultGear(type: ActivityType, gearList: Gear[], defaults: Partial<Record<ActivityType, string>>): string | null {
  const preferred = defaults[type];
  if (preferred && gearList.some((g) => g.id === preferred && !g.retired)) return preferred;
  const candidates = gearList.filter((g) => !g.retired && g.activityTypes.includes(type));
  return candidates.length === 1 ? candidates[0].id : null;
}
