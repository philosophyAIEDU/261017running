import { create } from 'zustand';

// 데이터가 바뀌었음을 화면들에 알리는 단순한 버전 카운터.
// 저장/삭제/복원 후 bump()를 호출하면 useDataVersion()을 의존성으로 쓰는 화면이 다시 읽는다.

interface DataState {
  version: number;
  bump: () => void;
}

export const useDataStore = create<DataState>((set) => ({
  version: 0,
  bump: (): void => set((s) => ({ version: s.version + 1 })),
}));

export function useDataVersion(): number {
  return useDataStore((s) => s.version);
}

export function bumpData(): void {
  useDataStore.getState().bump();
}
