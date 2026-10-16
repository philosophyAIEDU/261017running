import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/theme';

const LABELS: Record<number, string> = { 1: '아주 쉬움', 4: '보통', 7: '힘듦', 10: '최대' };

/** 체감 강도(RPE) 1~10 */
export function EffortPicker({ value, onChange, color }: { value: number | null; onChange: (v: number | null) => void; color: string }): React.JSX.Element {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const selected = value === n;
          return (
            <Pressable
              key={n}
              testID={`effort-${n}`}
              accessibilityRole="button"
              accessibilityLabel={`체감 강도 ${n}`}
              accessibilityState={{ selected }}
              onPress={() => onChange(selected ? null : n)}
              style={[styles.chip, { borderColor: selected ? color : t.border, backgroundColor: selected ? color : t.card }]}
            >
              <Text style={{ color: selected ? '#FFFFFF' : t.text, fontWeight: '700' }}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: t.subtext, fontSize: 12 }}>{value ? `${value} · ${LABELS[value] ?? LABELS[Object.keys(LABELS).map(Number).filter((k) => k <= value).pop() ?? 1]}` : '체감 강도를 선택하세요(선택 사항)'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', gap: 4 },
  chip: { flex: 1, aspectRatio: 1, maxHeight: 40, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
