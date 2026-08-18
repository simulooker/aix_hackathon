import { Ionicons } from '@expo/vector-icons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ROUTE_PROFILES } from '@/src/constants/map';
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
  const routeProfile = usePreferencesStore((state) => state.routeProfile);
  const setVoiceGuidance = usePreferencesStore((state) => state.setVoiceGuidance);
  const setShowHazards = usePreferencesStore((state) => state.setShowHazards);
  const setRouteProfile = usePreferencesStore((state) => state.setRouteProfile);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>이용 설정</Text>
        <Text style={styles.intro}>위드유를 이용하는 방식을 설정할 수 있습니다.</Text>

        <Text style={styles.sectionTitle}>이용자 유형</Text>
        <Text style={styles.sectionDescription}>선택한 유형에 맞춰 경사와 위험 구간을 반영합니다.</Text>
        <View style={styles.profileOptions}>
          {ROUTE_PROFILES.map((item) => {
            const selected = routeProfile === item.value;
            return (
              <Pressable key={item.value} style={[styles.profileOption, selected && styles.profileOptionSelected]} onPress={() => setRouteProfile(item.value)}>
                <View style={[styles.profileIcon, selected && styles.profileIconSelected]}>
                  {item.value === 'general' ? (
                    <Ionicons name="person-outline" size={22} color={selected ? '#FFFFFF' : '#167C5A'} />
                  ) : (
                    <FontAwesome5 name={item.value === 'elderly' ? 'blind' : 'wheelchair'} size={20} color={selected ? '#FFFFFF' : '#167C5A'} />
                  )}
                </View>
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>{item.label}</Text>
                  <Text style={styles.optionDescription}>{item.description}</Text>
                </View>
                <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? '#167C5A' : '#A8B4AF'} />
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>안내 및 지도</Text>
        <View style={styles.card}>
          <SettingRow icon="volume-high-outline" title="음성 길 안내" description="길 안내를 시작할 때 음성 안내를 사용합니다." value={voiceGuidance} onValueChange={setVoiceGuidance} />
          <View style={styles.divider} />
          <SettingRow icon="warning-outline" title="지도 위험 제보 표시" description="내 주변에 등록된 위험 위치를 지도에 표시합니다." value={showHazards} onValueChange={setShowHazards} />
        </View>
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark-outline" size={22} color="#167C5A" />
          <Text style={styles.infoText}>설정은 이 기기에 안전하게 저장되며 로그인하지 않아도 유지됩니다.</Text>
        </View>
        <Text style={styles.attribution}>날씨 정보 제공: Open-Meteo</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAF8' },
  content: { padding: 22, paddingBottom: 38 },
  heading: { marginTop: 12, color: '#14251F', fontSize: 26, fontWeight: '900' },
  intro: { marginTop: 7, marginBottom: 22, color: '#65756F', lineHeight: 20 },
  sectionTitle: { marginTop: 4, marginBottom: 5, color: '#14251F', fontSize: 18, fontWeight: '900' },
  sectionDescription: { marginBottom: 11, color: '#71817B', fontSize: 12 },
  profileOptions: { gap: 9, marginBottom: 22 },
  profileOption: { minHeight: 70, flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#DCE7E2', backgroundColor: '#FFFFFF' },
  profileOptionSelected: { borderColor: '#70B99F', backgroundColor: '#EFF8F4' },
  profileIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#E9F5F0' },
  profileIconSelected: { backgroundColor: '#167C5A' },
  optionText: { flex: 1, marginHorizontal: 12 },
  optionTitle: { color: '#14251F', fontSize: 15, fontWeight: '800' },
  optionDescription: { marginTop: 3, color: '#71817B', fontSize: 11 },
  card: { overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: '#DCE7E2', backgroundColor: '#FFFFFF' },
  row: { minHeight: 92, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#E9F5F0' },
  textArea: { flex: 1, marginHorizontal: 12 },
  title: { color: '#14251F', fontSize: 16, fontWeight: '800' },
  description: { marginTop: 4, color: '#71817B', fontSize: 12, lineHeight: 17 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 70, backgroundColor: '#DCE7E2' },
  infoCard: { flexDirection: 'row', gap: 10, marginTop: 18, padding: 15, borderRadius: 15, backgroundColor: '#E9F5F0' },
  infoText: { flex: 1, color: '#52645E', fontSize: 12, lineHeight: 18 },
  attribution: { marginTop: 10, color: '#8A9893', fontSize: 10, textAlign: 'center' },
});
