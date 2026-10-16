import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/theme';

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  color?: string;
}

export function Segmented<T extends string>({ options, value, onChange, color }: SegmentedProps<T>): React.JSX.Element {
  const t = useTheme();
  const accent = color ?? t.text;
  return (
    <View style={[styles.row, { borderColor: t.border, backgroundColor: t.card }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`seg-${o.value}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.item, selected && { backgroundColor: accent }]}
          >
            <Text style={{ color: selected ? (color ? '#FFFFFF' : t.bg) : t.text, fontWeight: '700' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3, gap: 3 },
  item: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
});
