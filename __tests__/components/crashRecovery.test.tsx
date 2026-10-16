import { act } from '@testing-library/react-native';
import { PERSIST_INTERVAL_MS } from '../../src/features/tracking/trackingService';
import { installTestRepositories } from '../helpers/testRepos';
import { straightLine } from '../helpers/fixtures';
import type { Repositories } from '../../src/db/repositories/types';
import type { RawLocation } from '../../src/types';

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

type Service = typeof import('../../src/features/tracking/trackingService');

jest.setTimeout(30_000);

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}

/** 앱 프로세스가 죽었다가 다시 뜬 것처럼 모듈 상태를 새로 만들고, 같은 DB(repository)를 연결한다. */
function relaunch(repos: Repositories): Service {
  let svc: Service | null = null;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('../../src/db/database') as typeof import('../../src/db/database')).setRepositories(repos);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const settings = require('../../src/store/settingsStore') as typeof import('../../src/store/settingsStore');
    settings.useSettingsStore.setState({ settings: { ...settings.DEFAULT_SETTINGS, voiceEnabled: false, autoPauseEnabled: { run: false, walk: false, ride: false } }, loaded: true, repo: repos.settings });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    svc = require('../../src/features/tracking/trackingService') as Service;
  });
  if (!svc) throw new Error('relaunch failed');
  return svc;
}

describe('크래시 복구', () => {
  beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 9, 16, 7, 0, 0) }));
  afterEach(() => jest.useRealTimers());

  it('10초마다 상태와 GPS 포인트를 저장하고, 재실행 후 이어서 기록할 수 있다', async () => {
    const repos = await installTestRepositories({ autoPauseEnabled: { run: false, walk: false, ride: false } });
    const first = relaunch(repos);
    first.startSession({ type: 'run', skipCountdown: true });
    await flush();
    const locs = straightLine({ speedMps: 3, intervalSec: 1, count: 25, start: Date.now() });
    for (const l of locs) {
      await act(async () => {
        jest.setSystemTime(l.timestamp);
        mockGps.emit?.([l]);
        jest.advanceTimersByTime(1);
      });
    }
    await act(async () => {
      jest.advanceTimersByTime(PERSIST_INTERVAL_MS);
    });
    await flush();
    const snap = await repos.recovery.get();
    expect(snap).not.toBeNull();
    const savedPoints = await repos.activities.countTrackPoints(snap?.id ?? '');
    expect(savedPoints).toBeGreaterThanOrEqual(20);

    // ── 강제 종료 후 5분 뒤 재실행 ──
    mockGps.emit = null;
    jest.setSystemTime(Date.now() + 5 * 60_000);
    const second = relaunch(repos);
    const info = await second.checkRecovery();
    expect(info).toMatchObject({ type: 'run', finished: false });
    expect(info?.distanceM).toBeGreaterThan(60);
    await act(async () => {
      expect(await second.resumeRecovered()).toBe('resumed');
    });
    expect(second.isSessionActive()).toBe(true);
    second.resumeSession();
    const more = straightLine({ speedMps: 3, intervalSec: 1, count: 10, start: Date.now() }).map((l) => ({ ...l, longitude: l.longitude + 0.001 }));
    for (const l of more) {
      await act(async () => {
        jest.setSystemTime(l.timestamp);
        mockGps.emit?.([l]);
      });
    }
    const holder: { draft: Awaited<ReturnType<Service['finishSession']>> } = { draft: null };
    await act(async () => {
      holder.draft = await second.finishSession();
    });
    const d = holder.draft;
    if (!d) throw new Error('draft 없음');
    expect(d.input.points.length).toBe(savedPoints + 10);
    // 앱이 꺼져 있던 5분은 일시정지로 처리되어 운동 시간에 포함되지 않는다
    expect(d.activity.durationSec).toBeLessThan(60);
    await act(async () => {
      await second.saveDraft({ title: '복구된 달리기', note: '', perceivedEffort: null });
    });
    expect(await repos.recovery.get()).toBeNull();
    expect((await repos.activities.listSummaries())[0].title).toBe('복구된 달리기');
  });

  it('복구를 버리면 임시 포인트도 지운다', async () => {
    const repos = await installTestRepositories();
    const svc = relaunch(repos);
    svc.startSession({ type: 'walk', skipCountdown: true });
    await flush();
    const id = (await repos.recovery.get())?.id ?? '';
    await repos.activities.appendTrackPoints(id, [{ activityId: id, timestamp: Date.now(), latitude: 37, longitude: 127, altitude: null, accuracy: 5, heartRate: null, cadence: null, sensorSpeedMps: null }], 0);
    const again = relaunch(repos);
    expect(await again.checkRecovery()).not.toBeNull();
    await again.discardDraft();
    expect(await repos.recovery.get()).toBeNull();
    expect(await repos.activities.countTrackPoints(id)).toBe(0);
  });
});
