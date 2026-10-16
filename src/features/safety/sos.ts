import * as SMS from 'expo-sms';
import type { EmergencyContact, LatLng } from '../../types';

export const MAX_EMERGENCY_CONTACTS = 3;

export function mapLink(loc: LatLng): string {
  const lat = loc.latitude.toFixed(6);
  const lon = loc.longitude.toFixed(6);
  return `https://maps.google.com/?q=${lat},${lon}`;
}

export function buildSosMessage(loc: LatLng | null, at: number, activityLabel: string): string {
  const time = new Date(at);
  const hhmm = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
  const where = loc ? `현재 위치: ${mapLink(loc)}` : '현재 위치를 확인할 수 없습니다.';
  return `[긴급] ${activityLabel} 중 도움이 필요합니다. (${hhmm})\n${where}`;
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9+]/g, '');
}

export function isValidPhone(phone: string): boolean {
  const n = normalizePhone(phone);
  return /^\+?[0-9]{8,15}$/.test(n);
}

/**
 * 긴급 문자 작성 화면을 연다. 문자는 사용자가 직접 확인하고 보낸다(자동 전송하지 않음).
 * expo-sms는 시스템 작성 화면만 띄우므로 앱이 몰래 전송할 수 없다.
 */
export async function openSosComposer(contacts: EmergencyContact[], loc: LatLng | null, activityLabel: string, now: number = Date.now()): Promise<'opened' | 'unavailable' | 'noContacts'> {
  if (contacts.length === 0) return 'noContacts';
  if (!(await SMS.isAvailableAsync())) return 'unavailable';
  await SMS.sendSMSAsync(
    contacts.map((c) => normalizePhone(c.phone)),
    buildSosMessage(loc, now, activityLabel),
  );
  return 'opened';
}
