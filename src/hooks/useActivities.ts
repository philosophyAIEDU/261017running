import { useAsync, type AsyncState } from './useAsync';
import { getRepositories } from '../db/database';
import { useDataVersion } from '../store/dataStore';
import type { ActivitySummary } from '../types';

/** 전체 활동 요약(GPS 포인트 미포함). 저장/삭제/복원 시 자동으로 다시 읽는다. */
export function useActivitySummaries(): AsyncState<ActivitySummary[]> {
  const version = useDataVersion();
  return useAsync(() => getRepositories().activities.listSummaries(), [version]);
}
