import { setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';

// 한국어 TTS 재생기.
// 말하는 동안에는 다른 앱의 음악 볼륨을 줄였다가(duckOthers) 끝나면 원래대로 복원한다(mixWithOthers).
// 여러 안내가 겹치면 큐에 쌓아 순서대로 읽는다.

let enabled = true;
const queue: string[] = [];
let speaking = false;

export function setVoiceEnabled(value: boolean): void {
  enabled = value;
  if (!value) {
    queue.length = 0;
    void Speech.stop();
  }
}

async function setDucking(duck: boolean): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: duck ? 'duckOthers' : 'mixWithOthers',
    });
  } catch {
    // 오디오 세션 설정 실패는 안내 자체를 막지 않는다.
  }
}

function playNext(): void {
  const text = queue.shift();
  if (text === undefined) {
    speaking = false;
    void setDucking(false);
    return;
  }
  speaking = true;
  const done = (): void => playNext();
  Speech.speak(text, { language: 'ko-KR', rate: 1.0, onDone: done, onStopped: done, onError: done });
}

export function speak(text: string): void {
  if (!enabled || text.length === 0) return;
  queue.push(text);
  if (!speaking) {
    speaking = true;
    void setDucking(true).then(playNext);
  }
}

export function stopSpeaking(): void {
  queue.length = 0;
  void Speech.stop();
}
