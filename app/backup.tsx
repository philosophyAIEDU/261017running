import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Button } from '../src/components/Button';
import { Card, Muted } from '../src/components/Card';
import { Screen } from '../src/components/Screen';
import { getRepositories } from '../src/db/database';
import { BackupError } from '../src/features/backup/backupFormat';
import { exportAndShareBackup, pickBackupFile, restoreFromFile } from '../src/features/backup/backupIO';
import { useAsync } from '../src/hooks/useAsync';
import { bumpData, useDataVersion } from '../src/store/dataStore';
import { useSettingsStore } from '../src/store/settingsStore';
import { useTheme } from '../src/theme/theme';
import { formatBytes, formatDateTime } from '../src/utils/format';
import type { BackupFile } from '../src/types';
import { eventTime } from '../src/utils/date';

export default function BackupScreen(): React.JSX.Element {
  const t = useTheme();
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const load = useSettingsStore((s) => s.load);
  const version = useDataVersion();
  const size = useAsync(() => getRepositories().storageBytes(), [version]);
  const [busy, setBusy] = useState(false);

  const doExport = async (): Promise<void> => {
    setBusy(true);
    try {
      const count = await exportAndShareBackup(getRepositories());
      await update({ lastBackupAt: eventTime() });
      Alert.alert('백업 파일을 만들었어요', `활동 ${count}개가 담긴 파일을 원하는 곳(파일 앱, 클라우드 드라이브, 메신저 등)에 저장하세요.`);
    } catch (e) {
      Alert.alert('백업 실패', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (file: BackupFile, mode: 'merge' | 'overwrite'): Promise<void> => {
    setBusy(true);
    try {
      const repos = getRepositories();
      const result = await restoreFromFile(repos, file, mode);
      await load(repos.settings);
      bumpData();
      Alert.alert('복원 완료', `활동 ${result.activitiesAdded}개를 가져왔어요. 현재 활동 ${result.activitiesTotal}개.`);
    } catch (e) {
      Alert.alert('복원 실패', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (): Promise<void> => {
    let file: BackupFile | null;
    try {
      file = await pickBackupFile();
    } catch (e) {
      Alert.alert('복원 실패', e instanceof BackupError || e instanceof Error ? e.message : String(e));
      return;
    }
    if (!file) return;
    const picked = file;
    Alert.alert('복원 방식을 선택하세요', `${formatDateTime(picked.exportedAt)} 백업 · 활동 ${picked.data.activities.length}개 (v${picked.appVersion})`, [
      { text: '취소', style: 'cancel' },
      { text: '기존 데이터에 합치기', onPress: () => void restore(picked, 'merge') },
      {
        text: '모두 덮어쓰기',
        style: 'destructive',
        onPress: () =>
          Alert.alert('⚠️ 모든 데이터가 바뀌어요', '이 기기의 활동, 장비, 목표, 배지, 설정이 모두 삭제되고 백업 파일 내용으로 바뀝니다. 되돌릴 수 없어요.', [
            { text: '취소', style: 'cancel' },
            { text: '덮어쓰기', style: 'destructive', onPress: () => void restore(picked, 'overwrite') },
          ]),
      },
    ]);
  };

  return (
    <Screen>
      <Card>
        <Text style={{ color: t.text, fontWeight: '700' }}>모든 기록은 이 기기에만 저장돼요</Text>
        <Muted>서버가 없기 때문에 휴대폰을 바꾸거나 잃어버리면 기록이 사라질 수 있어요. 백업 파일(JSON)을 만들어 직접 보관하세요.</Muted>
        <Muted>마지막 백업: {settings.lastBackupAt ? formatDateTime(settings.lastBackupAt) : '없음'}</Muted>
        <Muted>앱 데이터 용량: {size.data !== null ? formatBytes(size.data) : '계산 중…'}</Muted>
      </Card>
      <Button title="💾 백업 파일 만들기" big loading={busy} onPress={() => void doExport()} />
      <Button title="📂 백업 파일로 복원" big variant="secondary" disabled={busy} onPress={() => void doImport()} />
      <Muted>백업 파일에는 활동, GPS 경로, 장비, 목표, 배지, 내 구간, 훈련 플랜 진행, 설정이 담겨요. 센서 등록과 헬스 연동 설정은 기기마다 다시 해야 해요. 이전 버전 앱의 백업도 자동으로 변환해 복원해요.</Muted>
    </Screen>
  );
}
