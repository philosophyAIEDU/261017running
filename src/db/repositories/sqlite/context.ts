import type { SqlDatabase, SqlValue } from '../../sqlDatabase';

/**
 * SQLite는 트랜잭션 중첩을 지원하지 않으므로, 이미 트랜잭션 안이면 그대로 실행하고
 * 바깥에서만 BEGIN/COMMIT을 건다. (백업 복원처럼 여러 repository 저장을 하나로 묶을 때 필요)
 */
export class SqlContext {
  private depth = 0;

  constructor(readonly db: SqlDatabase) {}

  async tx(task: () => Promise<void>): Promise<void> {
    if (this.depth > 0) {
      await task();
      return;
    }
    this.depth += 1;
    try {
      await this.db.withTransactionAsync(task);
    } finally {
      this.depth -= 1;
    }
  }

  run(sql: string, params: SqlValue[] = []): Promise<unknown> {
    return this.db.runAsync(sql, params);
  }

  all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.db.getAllAsync<T>(sql, params);
  }

  first<T>(sql: string, params: SqlValue[] = []): Promise<T | null> {
    return this.db.getFirstAsync<T>(sql, params);
  }
}

export function bool(v: boolean): number {
  return v ? 1 : 0;
}

export function parseJson<T>(text: string | null, fallback: T): T {
  if (text === null) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** 여러 행을 VALUES (...),(...) 한 문장으로 넣는다. SQLite 변수 개수 제한(999)을 넘지 않게 나눈다. */
export async function bulkInsert(ctx: SqlContext, table: string, columns: string[], rows: SqlValue[][]): Promise<void> {
  if (rows.length === 0) return;
  const perRow = columns.length;
  const chunk = Math.max(1, Math.floor(900 / perRow));
  const placeholder = `(${columns.map(() => '?').join(',')})`;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    await ctx.run(`INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES ${part.map(() => placeholder).join(',')}`, part.flat());
  }
}
