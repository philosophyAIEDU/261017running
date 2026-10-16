import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { parseBackup } from './backupFormat';
import { exportBackup, restoreBackup, type RestoreMode, type RestoreResult } from './backupService';
import type { Repositories } from '../../db/repositories/types';
import type { BackupFile } from '../../types';

// 백업 파일 입출력. 파일은 캐시 폴더에 만든 뒤 휴대폰 공유 시트로 넘긴다.
// 사용자가 파일 앱/클라우드 드라이브/메신저 등 원하는 곳을 직접 고르며, 앱이 외부로 전송하지 않는다.

export function appVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

function stamp(now: number): string {
  const d = new Date(now);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function shareFile(file: File, mimeType: string, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('이 기기에서는 공유 기능을 사용할 수 없습니다.');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle, UTI: mimeType === 'application/json' ? 'public.json' : undefined });
}

export async function writeCacheFile(name: string, content: string): Promise<File> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(content);
  return file;
}

export async function exportAndShareBackup(repos: Repositories, now: number = Date.now()): Promise<number> {
  const backup = await exportBackup(repos, appVersion(), now);
  const file = await writeCacheFile(`activity-backup-${stamp(now)}.json`, JSON.stringify(backup));
  await shareFile(file, 'application/json', '백업 파일 저장');
  return backup.data.activities.length;
}

/** 파일 선택 → 파싱/마이그레이션. 사용자가 취소하면 null */
export async function pickBackupFile(): Promise<BackupFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (result.canceled || result.assets.length === 0) return null;
  const text = await new File(result.assets[0].uri).text();
  return parseBackup(text);
}

export function restoreFromFile(repos: Repositories, file: BackupFile, mode: RestoreMode): Promise<RestoreResult> {
  return restoreBackup(repos, file, mode);
}

/** GPX 등 텍스트 파일 선택 */
export async function pickTextFile(types: string[]): Promise<{ name: string; text: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return { name: asset.name, text: await new File(asset.uri).text() };
}
