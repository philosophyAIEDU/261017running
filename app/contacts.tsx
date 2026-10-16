import { useState } from 'react';
import { Alert } from 'react-native';
import { Button } from '../src/components/Button';
import { Card, Muted } from '../src/components/Card';
import { Field } from '../src/components/Field';
import { ListRow } from '../src/components/ListRow';
import { Screen } from '../src/components/Screen';
import { MAX_EMERGENCY_CONTACTS, isValidPhone } from '../src/features/safety/sos';
import { useSettingsStore } from '../src/store/settingsStore';
import { useTheme } from '../src/theme/theme';
import { newId } from '../src/utils/id';

export default function ContactsScreen(): React.JSX.Element {
  const t = useTheme();
  const contacts = useSettingsStore((s) => s.settings.emergencyContacts);
  const update = useSettingsStore((s) => s.update);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const add = (): void => {
    if (!name.trim() || !isValidPhone(phone)) {
      Alert.alert('이름과 올바른 전화번호를 입력하세요');
      return;
    }
    void update({ emergencyContacts: [...contacts, { id: newId(), name: name.trim(), phone: phone.trim() }] });
    setName('');
    setPhone('');
  };

  return (
    <Screen>
      <Muted>활동 중 화면의 SOS 버튼을 1.5초 길게 누르면, 현재 위치 지도 링크가 담긴 문자 작성 화면이 열려요. 문자는 직접 확인하고 보내며 자동으로 전송되지 않아요. 연락처는 이 기기에만 저장돼요.</Muted>
      <Card title={`긴급 연락처 (${contacts.length}/${MAX_EMERGENCY_CONTACTS})`}>
        {contacts.map((c) => (
          <ListRow key={c.id} title={c.name} subtitle={c.phone} right={<Button title="삭제" variant="ghost" color={t.danger} onPress={() => void update({ emergencyContacts: contacts.filter((x) => x.id !== c.id) })} />} />
        ))}
      </Card>
      {contacts.length < MAX_EMERGENCY_CONTACTS ? (
        <Card title="연락처 추가">
          <Field label="이름" value={name} onChangeText={setName} />
          <Field label="전화번호" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="010-0000-0000" />
          <Button title="추가" onPress={add} />
        </Card>
      ) : null}
    </Screen>
  );
}
