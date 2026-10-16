import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline, type MapPressEvent } from 'react-native-maps';
import { useTheme } from '../theme/theme';
import type { ColoredPath } from '../features/analysis/series';
import type { LatLng } from '../types';

// 지도 표시. 지도 타일 로딩 외에는 네트워크를 사용하지 않으며, 오프라인이면 타일만 비어 보이고 경로는 그대로 그려진다.
// iOS는 Apple 지도(기본 provider), Android는 Google 지도(app.json의 API 키 필요)를 쓴다.

interface RouteMapProps {
  path: LatLng[];
  coloredPaths?: ColoredPath[];
  color?: string;
  follow?: boolean; // 기록 중: 현재 위치를 따라감
  current?: LatLng | null;
  markers?: { id: string; coordinate: LatLng; title: string; color?: string }[];
  style?: ViewStyle;
  onPress?: (coord: LatLng) => void;
  highlight?: LatLng[];
}

const EDGE = { top: 40, right: 40, bottom: 40, left: 40 };

export function RouteMap({ path, coloredPaths, color, follow, current, markers, style, onPress, highlight }: RouteMapProps): React.JSX.Element {
  const t = useTheme();
  const ref = useRef<MapView>(null);
  const fittedFor = useRef(0);

  useEffect(() => {
    const map = ref.current;
    if (!map) return;
    if (follow && current) {
      map.animateCamera({ center: current, zoom: 16 }, { duration: 500 });
    } else if (!follow && path.length > 1 && fittedFor.current !== path.length) {
      fittedFor.current = path.length;
      map.fitToCoordinates(path, { edgePadding: EDGE, animated: false });
    }
  }, [follow, current, path]);

  const start = path[0];
  const end = path.length > 1 ? path[path.length - 1] : null;
  const initial = current ?? start;

  return (
    <View style={[styles.wrap, { borderColor: t.border }, style]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={initial ? { ...initial, latitudeDelta: 0.01, longitudeDelta: 0.01 } : undefined}
        showsUserLocation={follow}
        showsCompass={false}
        toolbarEnabled={false}
        userInterfaceStyle={t.dark ? 'dark' : 'light'}
        onPress={onPress ? (e: MapPressEvent) => onPress(e.nativeEvent.coordinate) : undefined}
      >
        {coloredPaths && coloredPaths.length > 0
          ? coloredPaths.map((p, i) => <Polyline key={`c${i}`} coordinates={p.coordinates} strokeColor={p.color} strokeWidth={5} />)
          : path.length > 1 && <Polyline coordinates={path} strokeColor={color ?? t.text} strokeWidth={5} />}
        {highlight && highlight.length > 1 ? <Polyline coordinates={highlight} strokeColor="#7A5AF8" strokeWidth={8} /> : null}
        {start && !follow ? <Marker coordinate={start} title="출발" pinColor="green" /> : null}
        {end && !follow ? <Marker coordinate={end} title="도착" pinColor="red" /> : null}
        {markers?.map((m) => <Marker key={m.id} coordinate={m.coordinate} title={m.title} pinColor={m.color} />)}
      </MapView>
      {path.length === 0 && !current ? (
        <View style={styles.empty} pointerEvents="none">
          <Text style={{ color: t.subtext }}>GPS 신호를 기다리는 중…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 240, borderRadius: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  empty: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
