import { Pedometer } from 'expo-sensors';
import type { EventSubscription } from 'expo';

// 걸음 수 측정. watchStepCount는 구독 시작 이후 걸음 수를 주므로,
// 일시정지/재개 때마다 구독을 다시 만들고 이전 구간 걸음 수(base)에 더한다.

export class StepCounter {
  private sub: EventSubscription | null = null;
  private base = 0;
  private current = 0;

  constructor(private readonly onSteps: (total: number) => void) {}

  static async isAvailable(): Promise<boolean> {
    try {
      return await Pedometer.isAvailableAsync();
    } catch {
      return false;
    }
  }

  start(initialSteps = 0): void {
    this.base = initialSteps;
    this.current = 0;
    this.subscribe();
  }

  private subscribe(): void {
    this.sub?.remove();
    this.sub = Pedometer.watchStepCount((result) => {
      this.current = result.steps;
      this.onSteps(this.base + this.current);
    });
  }

  pause(): void {
    this.base += this.current;
    this.current = 0;
    this.sub?.remove();
    this.sub = null;
  }

  resume(): void {
    this.subscribe();
  }

  stop(): number {
    this.pause();
    return this.base;
  }

  get total(): number {
    return this.base + this.current;
  }
}
