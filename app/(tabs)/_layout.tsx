import { Tabs } from 'expo-router/tabs';
import { Text } from 'react-native';
import { useTheme } from '../../src/theme/theme';

function TabIcon({ icon, focused }: { icon: string; focused: boolean }): React.JSX.Element {
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{icon}</Text>;
}

export default function TabsLayout(): React.JSX.Element {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.card },
        headerTintColor: t.text,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        tabBarActiveTintColor: t.text,
        tabBarInactiveTintColor: t.subtext,
      }}
    >
      <Tabs.Screen name="index" options={{ title: '홈', tabBarIcon: ({ focused }) => <TabIcon icon="🏠" focused={focused} /> }} />
      <Tabs.Screen name="record" options={{ title: '기록하기', tabBarIcon: ({ focused }) => <TabIcon icon="⏺️" focused={focused} /> }} />
      <Tabs.Screen name="history" options={{ title: '기록', tabBarIcon: ({ focused }) => <TabIcon icon="📋" focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: '내 정보', tabBarIcon: ({ focused }) => <TabIcon icon="👤" focused={focused} /> }} />
    </Tabs>
  );
}
