import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { MIN_TOUCH, useTheme } from '../theme/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  color?: string;
  big?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export function Button({ title, onPress, variant = 'primary', color, big, disabled, loading, style, testID }: ButtonProps): React.JSX.Element {
  const t = useTheme();
  const accent = color ?? t.text;
  const bg = variant === 'primary' ? accent : variant === 'danger' ? t.danger : variant === 'secondary' ? t.card : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? (variant === 'primary' && !color ? t.bg : '#FFFFFF') : accent;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, minHeight: big ? MIN_TOUCH : 48, borderColor: variant === 'secondary' ? t.border : 'transparent', opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.text, { color: fg, fontSize: big ? 20 : 16 }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  text: { fontWeight: '700' },
});
