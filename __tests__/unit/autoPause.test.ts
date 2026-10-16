import { ACTIVITY_CONFIGS } from '../../src/features/activity/activityConfig';
import { AutoPauseDetector } from '../../src/features/tracking/autoPause';

describe.each([
  ['run', 0.5, 5],
  ['walk', 0.2, 10],
  ['ride', 1.5, 3],
] as const)('%s 자동 일시정지 (%fm/s 미만 %i초)', (type, below, sec) => {
  const config = ACTIVITY_CONFIGS[type].autoPause;

  it('설정값이 표와 같다', () => {
    expect(config).toEqual({ speedBelowMps: below, durationSec: sec });
  });

  it('기준 미만이 durationSec 동안 이어지면 느려진 시점부터 소급해 일시정지', () => {
    const d = new AutoPauseDetector(config);
    expect(d.update(below * 3, 0)).toBeNull();
    expect(d.update(below * 0.5, 1000)).toBeNull();
    expect(d.update(below * 0.5, (sec - 1) * 1000 + 1000 - 1)).toBeNull();
    expect(d.update(below * 0.5, sec * 1000 + 1000)).toEqual({ type: 'pause', since: 1000 });
    expect(d.isPaused).toBe(true);
  });

  it('중간에 빨라지면 타이머가 초기화된다', () => {
    const d = new AutoPauseDetector(config);
    d.update(0, 0);
    d.update(below * 2, (sec - 1) * 1000);
    expect(d.update(0, sec * 1000)).toBeNull();
    expect(d.isPaused).toBe(false);
  });

  it('재개는 기준의 1.5배 이상이 2번 연속일 때', () => {
    const d = new AutoPauseDetector(config);
    d.update(0, 0);
    d.update(0, sec * 1000);
    expect(d.update(below * 2, 100_000)).toBeNull();
    expect(d.update(below * 1.2, 101_000)).toBeNull(); // 히스테리시스: 1.5배 미만은 무시
    expect(d.update(below * 2, 102_000)).toBeNull();
    expect(d.update(below * 2, 103_000)).toEqual({ type: 'resume', at: 103_000 });
  });

  it('위치 업데이트가 끊겨도 tick으로 판정한다', () => {
    const d = new AutoPauseDetector(config);
    d.markStill(0);
    expect(d.tick((sec - 1) * 1000)).toBeNull();
    expect(d.tick(sec * 1000)).toEqual({ type: 'pause', since: 0 });
    expect(d.tick(sec * 2000)).toBeNull();
  });
});

it('직렬화/복원', () => {
  const d = new AutoPauseDetector(ACTIVITY_CONFIGS.run.autoPause);
  d.update(0, 0);
  const copy = new AutoPauseDetector(ACTIVITY_CONFIGS.run.autoPause);
  copy.restore(d.serialize());
  expect(copy.update(0, 5000)).toEqual({ type: 'pause', since: 0 });
  copy.reset();
  expect(copy.isPaused).toBe(false);
});
