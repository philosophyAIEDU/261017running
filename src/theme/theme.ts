import { useColorScheme } from 'react-native';
import { ACTIVITY_CONFIGS } from '../features/activity/activityConfig';
import { useSettingsStore } from '../store/settingsStore';
import type { ActivityType } from '../types';

// 다크 모드와 고대비 색상. 야외 햇빛 아래에서도 읽히도록 고대비 모드는 순수 흑백 + 진한 강조색을 쓴다.

export interface Theme {
  dark: boolean;
  bg: string;
  card: string;
  text: string;
  subtext: string;
  border: string;
  danger: string;
  success: string;
  warning: string;
  onAccent: string;
  mode: (type: ActivityType) => string;
}

const light: Omit<Theme, 'mode' | 'dark'> = {
  bg: '#F4F5F7',
  card: '#FFFFFF',
  text: '#15171A',
  subtext: '#5F6670',
  border: '#E1E4E8',
  danger: '#D92D20',
  success: '#12805C',
  warning: '#B54708',
  onAccent: '#FFFFFF',
};

const dark: Omit<Theme, 'mode' | 'dark'> = {
  bg: '#0E1013',
  card: '#1A1D21',
  text: '#F2F4F7',
  subtext: '#A3AAB4',
  border: '#2C3036',
  danger: '#FF6B5E',
  success: '#4CD38A',
  warning: '#FDB022',
  onAccent: '#0E1013',
};

const lightHigh: Omit<Theme, 'mode' | 'dark'> = { ...light, bg: '#FFFFFF', card: '#FFFFFF', text: '#000000', subtext: '#1F1F1F', border: '#000000' };
const darkHigh: Omit<Theme, 'mode' | 'dark'> = { ...dark, bg: '#000000', card: '#000000', text: '#FFFFFF', subtext: '#EDEDED', border: '#FFFFFF' };

export function makeTheme(isDark: boolean, highContrast: boolean): Theme {
  const base = isDark ? (highContrast ? darkHigh : dark) : highContrast ? lightHigh : light;
  return {
    ...base,
    dark: isDark,
    mode: (type: ActivityType): string => (isDark ? ACTIVITY_CONFIGS[type].colorDark : ACTIVITY_CONFIGS[type].color),
  };
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const pref = useSettingsStore((s) => s.settings.theme);
  const highContrast = useSettingsStore((s) => s.settings.highContrast);
  const isDark = pref === 'system' ? scheme === 'dark' : pref === 'dark';
  return makeTheme(isDark, highContrast);
}

export const SPACING = 16;
export const RADIUS = 14;
/** 야외 사용성: 활동 중 핵심 숫자 최소 크기, 버튼 최소 크기 */
export const BIG_NUMBER_SIZE = 56;
export const MIN_TOUCH = 64;
