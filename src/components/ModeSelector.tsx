import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ACTIVITY_CONFIGS, ACTIVITY_TYPES } from '../features/activity/activityConfig';
import { useTheme } from '../theme/theme';
import type { ActivityType } from '../types';

interface ModeSelectorProps {
  value: ActivityType | null;
  onChange: (type: ActivityType | null) => void;
  allowAll?: boolean;
  compact?: boolean;
}

/** 달리기/산책/자전거 선택(allowAll이면 "전체" 포함). 모드별 색상과 아이콘. */
export function ModeSelector({ value, onChange, allowAll, compact }: ModeSelectorProps): React.JSX.Element {
  const t = useTheme();
  const options: (ActivityType | null)[] = allowAll ? [null, ...ACTIVITY_TYPES] : ACTIVITY_TYPES;
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map((type) => {
        const selected = value === type;
        const color = type ? t.mode(type) : t.text;
        const label = type ? ACTIVITY_CONFIGS[type].label : '전체';
        return (
          <Pressable
            key={type ?? 'all'}
            testID={`mode-${type ?? 'all'}`}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            onPress={() => onChange(type)}
            style={[styles.item, { minHeight: compact ? 40 : 64, borderColor: selected ? color : t.border, backgroundColor: selected ? color : t.card }]}
          >
            {type && !compact ? <Text style={styles.icon}>{ACTIVITY_CONFIGS[type].icon}</Text> : null}
            <Text style={[styles.label, { color: selected ? (type ? '#FFFFFF' : t.bg) : t.text }]}>{compact && type ? `${ACTIVITY_CONFIGS[type].icon} ${label}` : label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  item: { flex: 1, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  icon: { fontSize: 24 },
  label: { fontSize: 15, fontWeight: '700' },
});
