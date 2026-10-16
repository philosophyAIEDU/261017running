import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { useTheme } from '../theme/theme';

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  testID?: string;
  onEndEditing?: () => void;
}

export function Field({ label, value, onChangeText, placeholder, keyboardType, multiline, testID, onEndEditing }: FieldProps): React.JSX.Element {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: t.subtext }]}>{label}</Text>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.subtext}
        keyboardType={keyboardType}
        multiline={multiline}
        onEndEditing={onEndEditing}
        style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card, minHeight: multiline ? 80 : 48 }]}
      />
    </View>
  );
}

/** 입력을 마쳤을 때(포커스 해제) 한 번만 저장하는 숫자 입력 */
export function NumberSettingField({ label, value, onCommit, testID }: { label: string; value: number; onCommit: (n: number) => void; testID?: string }): React.JSX.Element {
  // 입력 중일 때만 로컬 텍스트를 쓰고, 그 외에는 저장된 값을 그대로 보여준다.
  const [text, setText] = useState<string | null>(null);
  return (
    <Field
      label={label}
      value={text ?? String(value)}
      onChangeText={setText}
      keyboardType="decimal-pad"
      testID={testID}
      onEndEditing={() => {
        const n = text !== null ? parseNumber(text) : null;
        if (n !== null && n > 0) onCommit(n);
        setText(null);
      }}
    />
  );
}

export function parseNumber(text: string): number | null {
  const n = Number(text.replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(n) ? n : null;
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, textAlignVertical: 'top', paddingTop: 12 },
});
