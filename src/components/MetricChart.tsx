import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { useTheme } from '../theme/theme';
import type { SeriesPoint } from '../features/analysis/series';

interface MetricChartProps {
  title: string;
  data: SeriesPoint[];
  color: string;
  formatY?: (y: number) => string;
  formatX?: (x: number) => string;
  invert?: boolean; // 페이스처럼 작을수록 좋은 값(위가 빠름)
  type?: 'line' | 'bar';
  maxPoints?: number;
  summary?: string;
}

function downsample(data: SeriesPoint[], max: number): SeriesPoint[] {
  if (data.length <= max) return data;
  const step = data.length / max;
  return Array.from({ length: max }, (_, i) => data[Math.floor(i * step)]);
}

/** 페이스/속도/고도/심박/걸음 수 그래프 */
export function MetricChart({ title, data, color, formatY = (y) => y.toFixed(0), formatX, invert, type = 'line', maxPoints = 60, summary }: MetricChartProps): React.JSX.Element {
  const t = useTheme();
  const [width, setWidth] = useState(300);
  const onLayout = (e: LayoutChangeEvent): void => setWidth(e.nativeEvent.layout.width);
  const sampled = downsample(data, maxPoints);
  const values = sampled.map((p) => p.y);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;
  const labelEvery = Math.max(1, Math.ceil(sampled.length / 5));
  const chartData = sampled.map((p, i) => ({
    value: invert ? max - p.y + min : p.y,
    label: formatX && i % labelEvery === 0 ? formatX(p.x) : '',
  }));
  const yLabel = (v: string): string => formatY(invert ? max - Number(v) + min : Number(v));
  const spacing = Math.max(2, (width - 60) / Math.max(1, sampled.length));
  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: t.text }]}>{title}</Text>
        {summary ? <Text style={{ color: t.subtext, fontSize: 13 }}>{summary}</Text> : null}
      </View>
      {sampled.length < 2 ? (
        <Text style={{ color: t.subtext }}>데이터가 부족합니다</Text>
      ) : type === 'line' ? (
        <LineChart
          data={chartData}
          width={width - 50}
          height={140}
          color={color}
          thickness={2}
          hideDataPoints
          areaChart
          startFillColor={color}
          endFillColor={color}
          startOpacity={0.3}
          endOpacity={0.02}
          spacing={spacing}
          initialSpacing={0}
          yAxisColor={t.border}
          xAxisColor={t.border}
          yAxisTextStyle={{ color: t.subtext, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: t.subtext, fontSize: 10 }}
          rulesColor={t.border}
          noOfSections={4}
          formatYLabel={yLabel}
          yAxisOffset={invert ? 0 : Math.floor(min * 0.95)}
          adjustToWidth
        />
      ) : (
        <BarChart
          data={chartData.map((d) => ({ ...d, frontColor: color }))}
          width={width - 50}
          height={140}
          barWidth={Math.max(4, spacing * 0.6)}
          spacing={Math.max(2, spacing * 0.4)}
          initialSpacing={4}
          yAxisColor={t.border}
          xAxisColor={t.border}
          yAxisTextStyle={{ color: t.subtext, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: t.subtext, fontSize: 10 }}
          rulesColor={t.border}
          noOfSections={4}
          formatYLabel={(v: string) => formatY(Number(v))}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, overflow: 'hidden' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontSize: 16, fontWeight: '700' },
});
