import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { RADIUS, useTheme } from '../theme/theme';

interface CardProps {
  children: ReactNode;
  title?: string;
  right?: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  accent?: string;
}

export function Card({ children, title, right, onPress, style, accent }: CardProps): React.JSX.Element {
  const t = useTheme();
  const body = (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: accent ?? t.border, borderLeftWidth: accent ? 4 : StyleSheet.hairlineWidth }, style]}>
      {title || right ? (
        <View style={styles.header}>
          {title ? <Text style={[styles.title, { color: t.text }]}>{title}</Text> : <View />}
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function SectionTitle({ children }: { children: string }): React.JSX.Element {
  const t = useTheme();
  return <Text style={[styles.section, { color: t.subtext }]}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }): React.JSX.Element {
  const t = useTheme();
  return <Text style={{ color: t.subtext, fontSize: 14, lineHeight: 20 }}>{children}</Text>;
}

export function Body({ children, bold }: { children: ReactNode; bold?: boolean }): React.JSX.Element {
  const t = useTheme();
  return <Text style={{ color: t.text, fontSize: 16, lineHeight: 22, fontWeight: bold ? '700' : '400' }}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS, padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700' },
  section: { fontSize: 13, fontWeight: '700', marginTop: 8, letterSpacing: 0.5 },
});
