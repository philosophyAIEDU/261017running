import * as Sharing from 'expo-sharing';
import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/**
 * 공유 카드를 기기 안에서 PNG로 캡처해 휴대폰 공유 시트로 넘긴다.
 * 이미지 파일은 캐시에만 만들어지며 서버로 업로드하지 않는다.
 */
export async function shareViewAsImage(ref: RefObject<ComponentRef<typeof View> | null>): Promise<void> {
  if (!ref.current) throw new Error('공유 이미지를 만들 수 없습니다.');
  const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
  if (!(await Sharing.isAvailableAsync())) throw new Error('이 기기에서는 공유 기능을 사용할 수 없습니다.');
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: '기록 공유' });
}
