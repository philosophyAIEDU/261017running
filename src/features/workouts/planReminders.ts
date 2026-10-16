import * as Notifications from 'expo-notifications';
import { nextReminderTime, type PlanWorkout } from './trainingPlans';

// 훈련 플랜 로컬 알림. 기기 안에서만 예약되며 푸시 서버를 사용하지 않는다.

export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
}

export async function scheduleNextWorkoutReminder(workout: PlanWorkout, now: number = Date.now()): Promise<boolean> {
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return false;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: { title: '오늘의 훈련', body: `${workout.title} — ${workout.description}` },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nextReminderTime(now) },
  });
  return true;
}

export async function cancelWorkoutReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
