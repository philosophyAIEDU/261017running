import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import HistoryScreen from '../../app/(tabs)/history';
import SummaryScreen from '../../app/summary';
import { buildActivity } from '../../src/features/tracking/activityBuilder';
import { finishSession, startSession } from '../../src/features/tracking/trackingService';
import { bumpData } from '../../src/store/dataStore';
import { resetTracking } from '../../src/store/trackingStore';
import { installTestRepositories } from '../helpers/testRepos';
import { makeActivity, straightLine, toTrackPoints } from '../helpers/fixtures';
import type { ActivityType, RawLocation } from '../../src/types';

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

/** 실제 세션으로 type 모드 기록을 speed m/s로 만든다(종료까지). */
async function recordDraft(type: ActivityType, speed: number, seconds: number): Promise<void> {
  startSession({ type, skipCountdown: true });
  await flush();
  const locs = straightLine({ speedMps: speed, intervalSec: 1, count: seconds, start: Date.now() });
  for (const l of locs) {
    await act(async () => {
      jest.setSystemTime(l.timestamp);
      mockGps.emit?.([l]);
    });
  }
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  await act(async () => {
    await finishSession();
  });
}

describe('활동 요약 화면은 모드에 맞는 지표를 보여준다', () => {
  beforeEach(async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 16, 7, 0, 0) });
    resetTracking();
    await installTestRepositories({ autoPauseEnabled: { run: false, walk: false, ride: false } });
  });
  afterEach(() => jest.useRealTimers());

  it('달리기: 페이스·스플릿, 속도 없음', async () => {
    await recordDraft('run', 3.2, 700);
    await render(<SummaryScreen />);
    expect(screen.getByTestId('stat-avgPace')).toHaveTextContent(/'.*"\/km/);
    expect(screen.queryByTestId('stat-maxSpeed')).toBeNull();
    expect(screen.getByTestId('split-table')).toBeTruthy();
    expect(screen.queryByTestId('mode-suggestion')).toBeNull();
  });

  it('자전거: 평균/최고 속도, 5km 스플릿', async () => {
    await recordDraft('ride', 7, 900);
    await render(<SummaryScreen />);
    expect(screen.getByTestId('stat-avgSpeed')).toHaveTextContent(/25\.\d km\/h/);
    expect(screen.getByTestId('stat-maxSpeed')).toBeTruthy();
    expect(screen.getByTestId('stat-elevation')).toBeTruthy();
    expect(screen.queryByTestId('stat-avgPace')).toBeNull();
  });

  it('산책: 페이스 표시', async () => {
    await recordDraft('walk', 1.3, 400);
    await render(<SummaryScreen />);
    expect(screen.getByTestId('stat-avgPace')).toBeTruthy();
    expect(screen.getByTestId('stat-calories')).toBeTruthy();
  });

  it('모드 오선택: 달리기로 자전거 속도를 기록하면 자전거로 바꿀지 제안하고, 바꾸면 지표가 바뀐다', async () => {
    await recordDraft('run', 7.5, 400);
    await render(<SummaryScreen />);
    expect(screen.getByTestId('mode-suggestion')).toHaveTextContent(/자전거 기록으로 바꿀까요\?/);
    await fireEvent.press(screen.getByText('자전거(으)로 변경'));
    expect(screen.queryByTestId('mode-suggestion')).toBeNull();
    expect(screen.getByTestId('stat-avgSpeed')).toBeTruthy();
    expect(screen.getByTestId('title-input').props.value).toBe('아침 자전거');
  });
});

describe('기록 목록 모드 필터', () => {
  it('전체/달리기/산책/자전거', async () => {
    const repos = await installTestRepositories();
    const t0 = new Date(2026, 9, 10, 7).getTime();
    const types: ActivityType[] = ['run', 'run', 'walk', 'ride'];
    for (let i = 0; i < types.length; i += 1) {
      const pts = toTrackPoints(straightLine({ speedMps: 3, intervalSec: 1, count: 20, start: t0 + i * 86_400_000 }), `h${i}`);
      const a = buildActivity({
        id: `h${i}`,
        type: types[i],
        startedAt: t0 + i * 86_400_000,
        endedAt: t0 + i * 86_400_000 + 19_000,
        points: pts,
        pauses: [],
        steps: null,
        stepSamples: [],
        workout: { kind: 'free', target: null, interval: null, planWorkoutId: null },
        source: 'gps',
        weightKg: null,
        maxHeartRate: null,
        gearId: null,
        isIndoor: false,
        now: 1,
      });
      await repos.activities.save(a, pts);
    }
    await repos.activities.save(makeActivity({ id: 'extra-walk', type: 'walk', startedAt: t0 - 86_400_000, steps: 5000 }), []);
    bumpData();
    await render(<HistoryScreen />);
    await waitFor(() => expect(screen.getByTestId('activity-h0')).toBeTruthy());
    expect(screen.getAllByTestId(/^activity-/)).toHaveLength(5);
    await fireEvent.press(screen.getByTestId('mode-run'));
    expect(screen.getAllByTestId(/^activity-/).map((e) => e.props.testID)).toEqual(['activity-h1', 'activity-h0']);
    await fireEvent.press(screen.getByTestId('mode-walk'));
    expect(screen.getAllByTestId(/^activity-/)).toHaveLength(2);
    expect(screen.getByText(/5,000보/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('mode-ride'));
    expect(screen.getAllByTestId(/^activity-/)).toHaveLength(1);
    await fireEvent.press(screen.getByTestId('mode-all'));
    expect(screen.getAllByTestId(/^activity-/)).toHaveLength(5);
  });

  it('기록이 없을 때 안내', async () => {
    await installTestRepositories();
    bumpData();
    await render(<HistoryScreen />);
    await waitFor(() => expect(screen.getByTestId('history-empty')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('mode-ride'));
    expect(screen.getByTestId('history-empty')).toHaveTextContent('자전거 기록이 없어요.');
  });
});
