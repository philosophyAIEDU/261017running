import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { MIN_TOUCH, useTheme } from '../theme/theme';

export const LONG_PRESS_MS = 1500;

interface LongPressButtonProps {
  title: string;
  hint?: string;
  color: string;
  onComplete: () => void;
  durationMs?: number;
  style?: ViewStyle;
  testID?: string;
}

/**
 * 오작동 방지용 길게 누르기 버튼(종료, SOS).
 * 누르는 동안 채워지는 진행 막대를 보여주고, durationMs(1.5초)를 다 채워야 실행된다.
 */
export function LongPressButton({ title, hint = '길게 누르기', color, onComplete, durationMs = LONG_PRESS_MS, style, testID }: LongPressButtonProps): React.JSX.Element {
  const t = useTheme();
  const [progress] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const start = (): void => {
    Animated.timing(progress, { toValue: 1, duration: durationMs, useNativeDriver: false }).start();
    timer.current = setTimeout(() => {
      timer.current = null;
      progress.setValue(0);
      onComplete();
    }, durationMs);
  };

  const cancel = (): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title} (${hint})`}
      accessibilityHint={`${durationMs / 1000}초 동안 길게 누르세요`}
      onPressIn={start}
      onPressOut={cancel}
      style={[styles.base, { borderColor: color, backgroundColor: t.card }, style]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: color, opacity: 0.35, width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      />
      <Text style={[styles.title, { color }]}>{title}</Text>
      <Text style={[styles.hint, { color: t.subtext }]}>{hint}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 12 },
  title: { fontSize: 20, fontWeight: '800' },
  hint: { fontSize: 11 },
});
