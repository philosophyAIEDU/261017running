import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import RecordScreen from '../../app/(tabs)/record';
import SummaryScreen from '../../app/summary';
import TrackingScreen from '../../app/tracking';
import { LONG_PRESS_MS } from '../../src/components/LongPressButton';
import { getRepositories } from '../../src/db/database';
import { resetTracking, useTrackingStore } from '../../src/store/trackingStore';
import { installTestRepositories } from '../helpers/testRepos';
import { ORIGIN, offset } from '../helpers/fixtures';
import type { ActivityType, RawLocation } from '../../src/types';

// 실제 trackingService + 엔진 + SQLite(메모리)를 그대로 쓰고, GPS만 가짜 위치 소스로 바꾼다.
const mockGps: { emit: ((locs: RawLocation[]) => void) | null } = { emit: null };
jest.mock('../../src/features/tracking/locationSource', () => ({
  BackgroundLocationSource: class {
    async start(_c: unknown, on: (l: RawLocation[]) => void): Promise<void> {
      mockGps.emit = on;
    }
    async stop(): Promise<void> {
      mockGps.emit = null;
    }
  },
  stopStrayLocationUpdates: jest.fn(),
}));
jest.mock('../../src/features/tracking/voiceCoach', () => ({ speak: jest.fn(), setVoiceEnabled: jest.fn(), stopSpeaking: jest.fn() }));

jest.setTimeout(30_000);

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}

const SPEED: Record<ActivityType, number> = { run: 3, walk: 1.3, ride: 7 };

/** 현재 시각부터 seconds초 동안 1초 간격 위치를 보내며 시간을 진행한다. */
async function move(type: ActivityType, startX: number, seconds: number): Promise<number> {
  let x = startX;
  for (let i = 0; i < seconds; i += 1) {
    x += SPEED[type];
    const p = offset(ORIGIN, x, 0);
    await act(async () => {
      mockGps.emit?.([{ ...p, timestamp: Date.now(), accuracy: 5, altitude: 10, speed: SPEED[type] }]);
      jest.advanceTimersByTime(1000);
    });
  }
  await flush();
  return x;
}

describe.each(['run', 'walk', 'ride'] as const)('%s: 모드 선택 → 시작 → 일시정지 → 재개 → 종료 → 요약', (type) => {
  beforeEach(async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 16, 7, 0, 0) });
    resetTracking();
    await installTestRepositories({ lastActivityType: 'run', autoPauseEnabled: { run: false, walk: false, ride: false } });
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('전체 흐름', async () => {
    await render(<RecordScreen />);
    await fireEvent.press(screen.getByTestId(`mode-${type}`));
    await fireEvent.press(screen.getByTestId('start-button'));
    await flush();
    expect(router.push).toHaveBeenCalledWith('/tracking');
    expect(useTrackingStore.getState()).toMatchObject({ phase: 'countdown', type, countdown: 3 });
    await screen.unmount();

    await render(<TrackingScreen />);
    expect(screen.getByTestId('countdown')).toBeTruthy();
    await advance(3000);
    expect(useTrackingStore.getState().phase).toBe('active');
    expect(screen.getByTestId('pause-button')).toBeTruthy();
    expect(screen.getByTestId('status-label')).toHaveTextContent(/기록 중/);

    const x = await move(type, 0, 120);
    // 모드별 실시간 지표: 달리기/산책은 페이스, 자전거는 속도
    expect(screen.getByTestId('metric-duration')).toBeTruthy();
    if (type === 'ride') {
      expect(screen.getByTestId('metric-currentSpeed')).toBeTruthy();
      expect(screen.getByTestId('metric-maxSpeed')).toBeTruthy();
    } else {
      expect(screen.getByTestId('metric-avgPace')).toBeTruthy();
    }
    expect(useTrackingStore.getState().snapshot?.distanceM).toBeGreaterThan(SPEED[type] * 100);

    await fireEvent.press(screen.getByTestId('pause-button'));
    await flush();
    expect(screen.getByTestId('status-label')).toHaveTextContent(/일시정지/);
    await advance(30_000); // 일시정지 30초는 시간에서 빠져야 한다
    await fireEvent.press(screen.getByTestId('resume-button'));
    await flush();
    expect(screen.getByTestId('status-label')).toHaveTextContent(/기록 중/);
    await move(type, x + 50, 30);

    await fireEvent.press(screen.getByTestId('pause-button'));
    await flush();
    // 종료는 1.5초 길게 눌러야 한다: 짧게 누르면 무시
    await fireEvent(screen.getByTestId('stop-button'), 'pressIn');
    await advance(500);
    await fireEvent(screen.getByTestId('stop-button'), 'pressOut');
    await advance(2000);
    expect(router.replace).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId('stop-button'), 'pressIn');
    await advance(LONG_PRESS_MS);
    expect(router.replace).toHaveBeenCalledWith('/summary');
    expect(useTrackingStore.getState().phase).toBe('finished');
    await screen.unmount();

    await render(<SummaryScreen />);
    const stats = screen.getByTestId('activity-stats');
    expect(stats).toBeTruthy();
    expect(screen.getByTestId('stat-distance')).toBeTruthy();
    expect(screen.getByTestId('stat-duration')).toHaveTextContent(/2:30/); // 120 + 30초, 일시정지 제외
    if (type === 'ride') {
      expect(screen.getByTestId('stat-avgSpeed')).toHaveTextContent(/km\/h/);
      expect(screen.queryByTestId('stat-avgPace')).toBeNull();
    } else {
      expect(screen.getByTestId('stat-avgPace')).toHaveTextContent(/\/km/);
      expect(screen.queryByTestId('stat-avgSpeed')).toBeNull();
    }
    expect(screen.queryByTestId('mode-suggestion')).toBeNull();

    await fireEvent.press(screen.getByTestId('save-button'));
    await flush();
    const saved = await getRepositories().activities.listSummaries();
    expect(saved).toHaveLength(1);
    expect(saved[0].type).toBe(type);
    expect(saved[0].durationSec).toBe(150);
    expect(await getRepositories().recovery.get()).toBeNull();
    expect(router.replace).toHaveBeenLastCalledWith({ pathname: '/activity/[id]', params: { id: saved[0].id } });
  });
});
