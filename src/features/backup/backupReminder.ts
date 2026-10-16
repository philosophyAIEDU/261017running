export const BACKUP_REMIND_AFTER_DAYS = 30;

/**
 * 홈 화면 백업 안내 여부.
 * 마지막 백업 후 30일이 지나면 안내한다. 한 번도 백업하지 않았다면 첫 활동 기록 시점부터 센다.
 * 기록이 하나도 없으면 백업할 것이 없으므로 안내하지 않는다.
 */
export function shouldRemindBackup(lastBackupAt: number | null, firstActivityAt: number | null, now: number): boolean {
  if (firstActivityAt === null) return false;
  const since = lastBackupAt ?? firstActivityAt;
  return now - since >= BACKUP_REMIND_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

export function daysSince(ts: number, now: number): number {
  return Math.floor((now - ts) / (24 * 60 * 60 * 1000));
}
