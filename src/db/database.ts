import * as SQLite from 'expo-sqlite';
import { createSqliteRepositories } from './repositories/sqlite/SqliteRepositories';
import { DB_NAME, migrateDatabase } from './schema';
import type { Repositories } from './repositories/types';
import type { SqlDatabase } from './sqlDatabase';

let repositories: Repositories | null = null;
let opening: Promise<Repositories> | null = null;

/** 앱 시작 시 한 번 호출: DB를 열고 마이그레이션한 뒤 repository를 만든다. */
export function initDatabase(): Promise<Repositories> {
  if (repositories) return Promise.resolve(repositories);
  if (!opening) {
    opening = (async (): Promise<Repositories> => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync('PRAGMA journal_mode = WAL;');
      const sql: SqlDatabase = db;
      await migrateDatabase(sql);
      repositories = createSqliteRepositories(sql);
      return repositories;
    })();
  }
  return opening;
}

export function getRepositories(): Repositories {
  if (!repositories) throw new Error('DB가 아직 초기화되지 않았습니다. initDatabase()를 먼저 호출하세요.');
  return repositories;
}

/** 테스트나 다른 저장소 구현(추후 서버 동기화)을 주입할 때 사용 */
export function setRepositories(repos: Repositories | null): void {
  repositories = repos;
  opening = null;
}
