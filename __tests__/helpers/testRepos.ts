import { setRepositories } from '../../src/db/database';
import { createSqliteRepositories } from '../../src/db/repositories/sqlite/SqliteRepositories';
import { migrateDatabase } from '../../src/db/schema';
import { DEFAULT_SETTINGS, useSettingsStore } from '../../src/store/settingsStore';
import { SqlJsDatabase } from './sqlJsDatabase';
import type { Repositories } from '../../src/db/repositories/types';
import type { AppSettings } from '../../src/types';

/** 컴포넌트 테스트용: 메모리 SQLite로 repository를 만들어 앱 전역에 주입한다. */
export async function installTestRepositories(settings: Partial<AppSettings> = {}): Promise<Repositories> {
  const db = await SqlJsDatabase.create();
  await migrateDatabase(db);
  const repos = createSqliteRepositories(db);
  setRepositories(repos);
  useSettingsStore.setState({
    settings: { ...DEFAULT_SETTINGS, safetyNoticeAcknowledged: true, rideSafetyNoticeAcknowledged: true, voiceEnabled: false, ...settings },
    loaded: true,
    repo: repos.settings,
  });
  return repos;
}
