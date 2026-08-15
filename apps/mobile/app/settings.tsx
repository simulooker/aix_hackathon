import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, StyleSheet, Switch, Text, View } from 'react-native';

import { usePreferencesStore } from '@/src/stores/preferences-store';

function SettingRow({
  icon,
  title,
  description,
  value,
  onValueChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}><Ionicons name={icon} size={23} color="#167C5A" /></View>
      <View style={styles.textArea}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#CBD5D1', true: '#8BC8B1' }} thumbColor={value ? '#167C5A' : '#FFFFFF'} />
    </View>
  );
}

export default function SettingsScreen() {
  const voiceGuidance = usePreferencesStore((state) => state.voiceGuidance);
  const showHazards = usePreferencesStore((state) => state.showHazards);
  const setVoiceGuidance = usePreferencesStore((state) => state.setVoiceGuidance);
  const setShowHazards = usePreferencesStore((state) => state.setShowHazards);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>이용 설정</Text>
      <Text style={styles.intro}>위드유를 이용하는 방식을 설정할 수 있습니다.</Text>
      <View style={styles.card}>
        <SettingRow icon="volume-high-outline" title="음성 길 안내" description="길 안내를 시작할 때 음성 안내를 사용합니다." value={voiceGuidance} onValueChange={setVoiceGuidance} />
        <View style={styles.divider} />
        <SettingRow icon="warning-outline" title="지도 위험 제보 표시" description="내 주변에 등록된 위험 위치를 지도에 표시합니다." value={showHazards} onValueChange={setShowHazards} />
      </View>
      <View style={styles.infoCard}>
        <Ionicons name="shield-checkmark-outline" size={22} color="#167C5A" />
        <Text style={styles.infoText}>설정은 이 기기에 안전하게 저장되며 언제든 변경할 수 있습니다.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 22, backgroundColor: '#F7FAF8' },
  heading: { marginTop: 12, color: '#14251F', fontSize: 26, fontWeight: '900' },
  intro: { marginTop: 7, marginBottom: 22, color: '#65756F', lineHeight: 20 },
  card: { overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: '#DCE7E2', backgroundColor: '#FFFFFF' },
  row: { minHeight: 92, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#E9F5F0' },
  textArea: { flex: 1, marginHorizontal: 12 },
  title: { color: '#14251F', fontSize: 16, fontWeight: '800' },
  description: { marginTop: 4, color: '#71817B', fontSize: 12, lineHeight: 17 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 70, backgroundColor: '#DCE7E2' },
  infoCard: { flexDirection: 'row', gap: 10, marginTop: 18, padding: 15, borderRadius: 15, backgroundColor: '#E9F5F0' },
  infoText: { flex: 1, color: '#52645E', fontSize: 12, lineHeight: 18 },
});
