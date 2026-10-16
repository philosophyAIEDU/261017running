import { StyleSheet, Text, View } from 'react-native';
import { BIG_NUMBER_SIZE, useTheme } from '../theme/theme';

interface BigStatProps {
  label: string;
  value: string;
  unit?: string;
  size?: 'hero' | 'large' | 'medium';
  color?: string;
  testID?: string;
}

/** 활동 중 화면의 핵심 숫자. hero/large는 48pt 이상(야외 가독성). */
export function BigStat({ label, value, unit, size = 'large', color, testID }: BigStatProps): React.JSX.Element {
  const t = useTheme();
  const fontSize = size === 'hero' ? BIG_NUMBER_SIZE + 16 : size === 'large' ? BIG_NUMBER_SIZE - 8 : 28;
  return (
    <View style={styles.box} accessible accessibilityLabel={`${label} ${value} ${unit ?? ''}`} testID={testID}>
      <Text style={[styles.label, { color: t.subtext }]}>{label}</Text>
      <View style={styles.row}>
        <Text style={[styles.value, { color: color ?? t.text, fontSize }]} adjustsFontSizeToFit numberOfLines={1}>
          {value}
        </Text>
        {unit ? <Text style={[styles.unit, { color: t.subtext }]}>{unit}</Text> : null}
      </View>
    </View>
  );
}

export function SmallStat({ label, value }: { label: string; value: string }): React.JSX.Element {
  const t = useTheme();
  return (
    <View style={styles.small}>
      <Text style={{ color: t.subtext, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', paddingVertical: 4, flex: 1, minWidth: 140 },
  label: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  value: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 16, fontWeight: '600' },
  small: { minWidth: '30%', flexGrow: 1, gap: 2 },
});
