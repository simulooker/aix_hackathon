import { Ionicons } from '@expo/vector-icons';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/src/components/PrimaryButton';
import { ROUTE_PROFILES } from '@/src/constants/map';
import { changePassword, getCurrentUser, type CurrentUser } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/auth-store';
import { usePreferencesStore } from '@/src/stores/preferences-store';

export default function MyPageScreen() {
  const router = useRouter();
  const username = useAuthStore((state) => state.username);
  const clearUser = useAuthStore((state) => state.clearUser);
  const routeProfile = usePreferencesStore((state) => state.routeProfile);
  const setRouteProfile = usePreferencesStore((state) => state.setRouteProfile);
  const [user, setUser] = useState<CurrentUser>();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    getCurrentUser().then(setUser).catch((value) => setError(value instanceof Error ? value.message : '계정 정보를 불러오지 못했습니다.'));
  }, []);

  const submitPassword = async () => {
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('변경 완료', '비밀번호가 변경되었습니다.');
    } catch (value) {
      setError(value instanceof Error ? value.message : '비밀번호를 변경하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearUser();
    router.replace('/map');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.profileCard}>
          <View style={styles.avatar}><Ionicons name="person" size={34} color="#FFFFFF" /></View>
          <View style={styles.profileText}>
            <Text style={styles.username}>{user?.username ?? username}</Text>
            {user ? <Text style={styles.email}>{user.email}</Text> : <ActivityIndicator size="small" color="#167C5A" />}
          </View>
        </View>

        <Text style={styles.sectionTitle}>이용자 유형</Text>
        <Text style={styles.sectionDescription}>선택한 유형을 다음 경로 검색부터 적용합니다.</Text>
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

        <Text style={styles.sectionTitle}>비밀번호 변경</Text>
        <View style={styles.card}>
          <Text style={styles.label}>현재 비밀번호</Text>
          <TextInput value={currentPassword} onChangeText={setCurrentPassword} placeholder="현재 비밀번호를 입력해 주세요" placeholderTextColor="#7A8984" secureTextEntry autoCapitalize="none" autoCorrect={false} style={styles.input} />
          <Text style={styles.label}>새 비밀번호</Text>
          <TextInput value={newPassword} onChangeText={setNewPassword} placeholder="영문·숫자·특수문자 포함 8자 이상" placeholderTextColor="#7A8984" secureTextEntry autoCapitalize="none" autoCorrect={false} style={styles.input} />
          <Text style={styles.label}>새 비밀번호 확인</Text>
          <TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="새 비밀번호를 다시 입력해 주세요" placeholderTextColor="#7A8984" secureTextEntry autoCapitalize="none" autoCorrect={false} style={styles.input} />
          {error && <Text style={styles.error}>{error}</Text>}
          <PrimaryButton label="비밀번호 변경" onPress={() => void submitPassword()} loading={loading} disabled={!currentPassword || !newPassword || !confirmPassword} />
        </View>

        <PrimaryButton label="로그아웃" variant="dark" onPress={logout} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAF8' },
  content: { padding: 22, gap: 18 },
  profileCard: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 20, backgroundColor: '#E2F3EC' },
  avatar: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 31, backgroundColor: '#167C5A' },
  profileText: { flex: 1, marginLeft: 15 },
  username: { color: '#14251F', fontSize: 21, fontWeight: '900' },
  email: { marginTop: 5, color: '#596A64', fontSize: 14 },
  sectionTitle: { marginTop: 4, color: '#14251F', fontSize: 18, fontWeight: '900' },
  sectionDescription: { marginTop: -12, color: '#71817B', fontSize: 12 },
  profileOptions: { gap: 9 },
  profileOption: { minHeight: 70, flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#DCE7E2', backgroundColor: '#FFFFFF' },
  profileOptionSelected: { borderColor: '#70B99F', backgroundColor: '#EFF8F4' },
  profileIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#E9F5F0' },
  profileIconSelected: { backgroundColor: '#167C5A' },
  optionText: { flex: 1, marginHorizontal: 12 },
  optionTitle: { color: '#14251F', fontSize: 15, fontWeight: '800' },
  optionDescription: { marginTop: 3, color: '#71817B', fontSize: 11 },
  card: { padding: 17, borderRadius: 18, borderWidth: 1, borderColor: '#DCE7E2', backgroundColor: '#FFFFFF' },
  label: { marginBottom: 7, color: '#263D35', fontSize: 13, fontWeight: '800' },
  input: { marginBottom: 14, padding: 14, borderWidth: 1, borderColor: '#DCE7E2', borderRadius: 13, color: '#14251F', backgroundColor: '#FAFCFB' },
  error: { marginBottom: 12, color: '#B42318', lineHeight: 19 },
});
