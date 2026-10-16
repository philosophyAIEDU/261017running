import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../theme/theme';

interface ListRowProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  icon?: string;
}

export function ListRow({ title, subtitle, right, onPress, icon }: ListRowProps): React.JSX.Element {
  const t = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, { borderColor: t.border, opacity: pressed ? 0.6 : 1 }]}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <View style={styles.texts}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
        {subtitle ? <Text style={{ color: t.subtext, fontSize: 13 }}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Text style={{ color: t.subtext, fontSize: 18 }}>›</Text> : null)}
    </Pressable>
  );
}

export function SwitchRow({ title, subtitle, value, onValueChange, testID }: { title: string; subtitle?: string; value: boolean; onValueChange: (v: boolean) => void; testID?: string }): React.JSX.Element {
  return <ListRow title={title} subtitle={subtitle} right={<Switch testID={testID} value={value} onValueChange={onValueChange} accessibilityLabel={title} />} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 52 },
  icon: { fontSize: 22, width: 30, textAlign: 'center' },
  texts: { flex: 1, gap: 2 },
});
