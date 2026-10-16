import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../theme/theme';

interface ProgressRingProps {
  progress: number; // 0~1 (1 초과 가능)
  color: string;
  size?: number;
  label: string;
  sublabel?: string;
}

export function ProgressRing({ progress, color, size = 96, label, sublabel }: ProgressRingProps): React.JSX.Element {
  const t = useTheme();
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={styles.wrap} accessible accessibilityLabel={`${label} ${Math.round(progress * 100)}%`}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.border} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - p)}
            strokeLinecap="round"
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: size / 5 }}>{Math.round(progress * 100)}%</Text>
        </View>
      </View>
      <Text style={{ color: t.text, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
        {label}
      </Text>
      {sublabel ? (
        <Text style={{ color: t.subtext, fontSize: 11 }} numberOfLines={1}>
          {sublabel}
        </Text>
      ) : null}
    </View>
  );
}

export function ProgressBar({ progress, color }: { progress: number; color: string }): React.JSX.Element {
  const t = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: t.border }]}>
      <View style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%`, backgroundColor: color, height: '100%', borderRadius: 4 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 4, flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
});
