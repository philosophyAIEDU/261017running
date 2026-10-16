import { router } from 'expo-router';
import { Text } from 'react-native';
import { Card, Muted } from '../src/components/Card';
import { ListRow } from '../src/components/ListRow';
import { Screen } from '../src/components/Screen';
import { getRepositories } from '../src/db/database';
import { useAsync } from '../src/hooks/useAsync';
import { useDataVersion } from '../src/store/dataStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { useTheme } from '../src/theme/theme';
import { formatDistance } from '../src/utils/format';

export default function SegmentsScreen(): React.JSX.Element {
  const t = useTheme();
  const unit = useSettingsStore((s) => s.settings.unit);
  const version = useDataVersion();
  const { data } = useAsync(async () => {
    const repos = getRepositories();
    const [segments, efforts] = await Promise.all([repos.segments.list(), repos.segments.listEfforts()]);
    return segments.map((s) => ({ segment: s, count: efforts.filter((e) => e.segmentId === s.id).length }));
  }, [version]);
  return (
    <Screen>
      {data && data.length === 0 ? (
        <Card>
          <Text style={{ color: t.text, fontWeight: '700' }}>아직 내 구간이 없어요</Text>
          <Muted>활동 상세 화면에서 「이 경로로 내 구간 만들기」를 눌러 집 앞 언덕, 한강 1km 같은 구간을 저장해 보세요.</Muted>
        </Card>
      ) : null}
      {(data ?? []).map(({ segment, count }) => (
        <ListRow key={segment.id} icon="📍" title={segment.name} subtitle={`${formatDistance(segment.distanceM, unit)} · 기록 ${count}회`} onPress={() => router.push({ pathname: '/segment/[id]', params: { id: segment.id } })} />
      ))}
    </Screen>
  );
}
