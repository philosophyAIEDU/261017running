import { router } from 'expo-router';
import { Text } from 'react-native';
import { Card, Muted } from '../src/components/Card';
import { ProgressBar } from '../src/components/ProgressRing';
import { Screen } from '../src/components/Screen';
import { getRepositories } from '../src/db/database';
import { ACTIVITY_CONFIGS } from '../src/features/activity/activityConfig';
import { TRAINING_PLANS, planCompletion } from '../src/features/workouts/trainingPlans';
import { useAsync } from '../src/hooks/useAsync';
import { useDataVersion } from '../src/store/dataStore';
import { useTheme } from '../src/theme/theme';

export default function PlansScreen(): React.JSX.Element {
  const t = useTheme();
  const version = useDataVersion();
  const progress = useAsync(() => getRepositories().plans.list(), [version]);
  return (
    <Screen>
      {TRAINING_PLANS.map((plan) => {
        const p = progress.data?.find((x) => x.planId === plan.id && x.active);
        return (
          <Card key={plan.id} accent={t.mode(plan.activityType)} onPress={() => router.push({ pathname: '/plan/[id]', params: { id: plan.id } })}>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>
              {plan.icon} {plan.title}
            </Text>
            <Muted>
              {ACTIVITY_CONFIGS[plan.activityType].label} · {plan.level} · {plan.weeks.length}주 — {plan.description}
            </Muted>
            {p ? <ProgressBar progress={planCompletion(plan, p)} color={t.mode(plan.activityType)} /> : null}
          </Card>
        );
      })}
    </Screen>
  );
}
