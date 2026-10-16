// 자동 일시정지 판정기.
//
// 동작 원리
//  - 속도가 speedBelowMps 미만인 상태가 durationSec 동안 계속되면 일시정지로 판정한다.
//  - 일시정지는 "느려지기 시작한 시점(slowSince)"부터 소급 적용한다. 신호등 앞에서 5초를 기다린 뒤에야
//    멈췄다고 알 수 있지만, 그 5초도 운동 시간에서 빼야 페이스가 정확하기 때문이다.
//  - 재개는 기준 속도의 1.5배 이상이 RESUME_CONFIRM_COUNT번 연속 관측될 때로 한다(히스테리시스).
//    정지 중 GPS 드리프트로 한 번 튄 속도에 바로 재개되는 것을 막는다.

export interface AutoPauseConfig {
  speedBelowMps: number;
  durationSec: number;
}

export type AutoPauseEvent =
  | { type: 'pause'; since: number } // since: 소급 적용할 일시정지 시작 시각
  | { type: 'resume'; at: number };

export const RESUME_SPEED_FACTOR = 1.5;
export const RESUME_CONFIRM_COUNT = 2;

export class AutoPauseDetector {
  private slowSince: number | null = null;
  private paused = false;
  private fastCount = 0;

  constructor(private readonly config: AutoPauseConfig) {}

  get isPaused(): boolean {
    return this.paused;
  }

  reset(): void {
    this.slowSince = null;
    this.paused = false;
    this.fastCount = 0;
  }

  /** 새 속도 관측값을 넣고, 상태가 바뀌면 이벤트를 돌려준다. */
  update(speedMps: number, timestamp: number): AutoPauseEvent | null {
    const { speedBelowMps, durationSec } = this.config;
    if (!this.paused) {
      if (speedMps < speedBelowMps) {
        if (this.slowSince === null) this.slowSince = timestamp;
        if ((timestamp - this.slowSince) / 1000 >= durationSec) {
          this.paused = true;
          this.fastCount = 0;
          return { type: 'pause', since: this.slowSince };
        }
      } else {
        this.slowSince = null;
      }
      return null;
    }
    if (speedMps >= speedBelowMps * RESUME_SPEED_FACTOR) {
      this.fastCount += 1;
      if (this.fastCount >= RESUME_CONFIRM_COUNT) {
        this.paused = false;
        this.slowSince = null;
        this.fastCount = 0;
        return { type: 'resume', at: timestamp };
      }
    } else {
      this.fastCount = 0;
    }
    return null;
  }

  /** 위치 업데이트가 끊긴 경우(정지 시 distanceInterval 때문에 이벤트가 안 옴)를 위한 시간 경과 체크 */
  tick(now: number): AutoPauseEvent | null {
    if (this.paused || this.slowSince === null) return null;
    if ((now - this.slowSince) / 1000 >= this.config.durationSec) {
      this.paused = true;
      this.fastCount = 0;
      return { type: 'pause', since: this.slowSince };
    }
    return null;
  }

  /** 마지막 위치 이후 오래 업데이트가 없으면 그 시점부터 느린 상태로 간주한다. */
  markStill(since: number): void {
    if (!this.paused && this.slowSince === null) this.slowSince = since;
  }

  serialize(): { slowSince: number | null; paused: boolean; fastCount: number } {
    return { slowSince: this.slowSince, paused: this.paused, fastCount: this.fastCount };
  }

  restore(s: { slowSince: number | null; paused: boolean; fastCount: number }): void {
    this.slowSince = s.slowSince;
    this.paused = s.paused;
    this.fastCount = s.fastCount;
  }
}
