import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useDataStore } from '../store/dataStore';

/**
 * 렌더링에 쓰는 "현재 시각". 렌더 중 Date.now()를 직접 부르면 결과가 매번 달라지므로,
 * 상태로 들고 있다가 데이터 변경, 앱 복귀, 1분 경과 시에만 갱신한다.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = (): void => setNow(Date.now());
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') update();
    });
    const unsubscribe = useDataStore.subscribe(update);
    const timer = setInterval(update, 60_000);
    return () => {
      appState.remove();
      unsubscribe();
      clearInterval(timer);
    };
  }, []);
  return now;
}
