import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/theme';
import type { HeatmapDay } from '../features/analysis/stats';

const WEEK = ['월', '화', '수', '목', '금', '토', '일'];

/** 월간 캘린더: 활동한 날에 모드별 색상 점 */
export function CalendarHeatmap({ days }: { days: HeatmapDay[] }): React.JSX.Element {
  const t = useTheme();
  if (days.length === 0) return <View />;
  const lead = (new Date(days[0].date).getDay() + 6) % 7;
  const cells: (HeatmapDay | null)[] = [...Array.from({ length: lead }, () => null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {WEEK.map((w) => (
          <Text key={w} style={[styles.cell, styles.head, { color: t.subtext }]}>
            {w}
          </Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((d, j) => (
            <View key={j} style={[styles.cell, styles.day, d && d.types.length > 0 ? { backgroundColor: t.dark ? '#22262C' : '#EEF1F4' } : null]}>
              {d ? <Text style={{ color: t.text, fontSize: 12 }}>{new Date(d.date).getDate()}</Text> : null}
              <View style={styles.dots}>
                {d?.types.map((type) => <View key={type} style={[styles.dot, { backgroundColor: t.mode(type) }]} />)}
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  row: { flexDirection: 'row', gap: 4 },
  cell: { flex: 1, alignItems: 'center' },
  head: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  day: { aspectRatio: 1, borderRadius: 8, justifyContent: 'center', gap: 2 },
  dots: { flexDirection: 'row', gap: 2, height: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
