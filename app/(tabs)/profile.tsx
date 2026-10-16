import { router, type Href } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Muted } from '../../src/components/Card';
import { ListRow } from '../../src/components/ListRow';
import { ProgressBar } from '../../src/components/ProgressRing';
import { Screen } from '../../src/components/Screen';
import { ACTIVITY_CONFIGS, ACTIVITY_TYPES } from '../../src/features/activity/activityConfig';
import { modeDistanceLevel, overallLevel } from '../../src/features/gamification/levels';
import { useActivitySummaries } from '../../src/hooks/useActivities';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useTheme } from '../../src/theme/theme';
import { formatDistance, formatNumber } from '../../src/utils/format';

const LINKS: { icon: string; title: string; subtitle: string; href: Href }[] = [
  { icon: '📊', title: '통계', subtitle: '주간·월간·연간, 캘린더, 전년 대비', href: '/stats' },
  { icon: '🏆', title: '개인 기록', subtitle: '모드별 최고 기록과 레이스 예측', href: '/records' },
  { icon: '🎖️', title: '배지', subtitle: '획득한 배지와 도전 과제', href: '/badges' },
  { icon: '🎯', title: '목표', subtitle: '거리·걸음 수 목표', href: '/goals' },
  { icon: '📅', title: '훈련 플랜', subtitle: '5K 입문부터 풀코스, 걷기, 50km 라이딩', href: '/plans' },
  { icon: '📍', title: '내 구간', subtitle: '자주 달리는 구간의 기록 순위', href: '/segments' },
  { icon: '👟', title: '장비', subtitle: '신발, 자전거와 부품 관리', href: '/gear' },
  { icon: '💓', title: '센서 연결', subtitle: '심박 벨트, 자전거 속도·케이던스', href: '/sensors' },
  { icon: '💾', title: '백업 및 복원', subtitle: '기기 데이터를 파일로 보관', href: '/backup' },
  { icon: '⚙️', title: '설정', subtitle: '단위, 음성, 자동 일시정지, 안전, 개인정보', href: '/settings' },
];

export default function ProfileScreen(): React.JSX.Element {
  const t = useTheme();
  const unit = useSettingsStore((s) => s.settings.unit);
  const { data } = useActivitySummaries();
  const list = data ?? [];
  const level = overallLevel(list);
  return (
    <Screen>
      <Card>
        <Text style={{ color: t.text, fontSize: 26, fontWeight: '800' }}>Lv. {level.level}</Text>
        <ProgressBar progress={level.progress} color={t.text} />
        <Muted>
          총 활동 {formatNumber(level.current)}분 · {list.length}회
        </Muted>
        <View style={styles.modes}>
          {ACTIVITY_TYPES.map((type) => {
            const l = modeDistanceLevel(list, type);
            return (
              <View key={type} style={styles.mode}>
                <Text style={{ color: t.mode(type), fontWeight: '800' }}>
                  {ACTIVITY_CONFIGS[type].icon} Lv.{l.level}
                </Text>
                <ProgressBar progress={l.progress} color={t.mode(type)} />
                <Text style={{ color: t.subtext, fontSize: 11 }}>{formatDistance(l.current, unit, 0)}</Text>
              </View>
            );
          })}
        </View>
      </Card>
      <Card>
        {LINKS.map((l) => (
          <ListRow key={l.title} icon={l.icon} title={l.title} subtitle={l.subtitle} onPress={() => router.push(l.href)} />
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  modes: { flexDirection: 'row', gap: 12, marginTop: 4 },
  mode: { flex: 1, gap: 4 },
});
