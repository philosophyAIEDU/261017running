import { useCallback, useEffect, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

interface Result<T> {
  data: T | null;
  error: Error | null;
  key: string;
}

/**
 * 비동기 데이터 로딩. deps가 바뀌거나 reload()를 호출하면 다시 읽는다.
 * 로딩 상태는 "마지막으로 받은 결과의 key가 현재 요청 key와 다른가"로 계산해 effect 안에서 setState를 바로 부르지 않는다.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<Result<T>>({ data: null, error: null, key: '' });
  const key = JSON.stringify([...deps, tick]);
  useEffect(() => {
    let alive = true;
    fn()
      .then((data) => {
        if (alive) setResult({ data, error: null, key });
      })
      .catch((e: unknown) => {
        if (alive) setResult((prev) => ({ data: prev.data, error: e instanceof Error ? e : new Error(String(e)), key }));
      });
    return () => {
      alive = false;
    };
    // fn은 매 렌더 새로 만들어지므로 deps(key)로만 다시 실행한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data: result.data, loading: result.key !== key, error: result.error, reload };
}
