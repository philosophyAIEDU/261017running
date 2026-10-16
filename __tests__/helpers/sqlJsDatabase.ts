import initSqlJs, { type Database } from 'sql.js';
import type { SqlDatabase, SqlRunResult, SqlValue } from '../../src/db/sqlDatabase';

// 테스트용 SqlDatabase 구현: 순수 WASM SQLite(sql.js)로 expo-sqlite를 대신한다.
export class SqlJsDatabase implements SqlDatabase {
  private constructor(private readonly db: Database) {}

  static async create(): Promise<SqlJsDatabase> {
    const SQL = await initSqlJs();
    return new SqlJsDatabase(new SQL.Database());
  }

  async execAsync(source: string): Promise<void> {
    this.db.exec(source);
  }

  async runAsync(source: string, params: SqlValue[]): Promise<SqlRunResult> {
    this.db.run(source, params);
    return { changes: this.db.getRowsModified(), lastInsertRowId: 0 };
  }

  async getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]> {
    const stmt = this.db.prepare(source);
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    stmt.free();
    return rows;
  }

  async getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null> {
    const rows = await this.getAllAsync<T>(source, params);
    return rows[0] ?? null;
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.db.exec('BEGIN');
    try {
      await task();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}
