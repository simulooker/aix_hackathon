import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/src/components/PrimaryButton';
import { login } from '@/src/services/api';
import { useAuthStore } from '@/src/stores/auth-store';

export default function LoginScreen() {
  const router = useRouter();
  const setLoggedInUsername = useAuthStore((state) => state.setUsername);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const normalizedUsername = username.trim();
      await login(normalizedUsername, password);
      setLoggedInUsername(normalizedUsername);
      router.replace('/map' as Href);
    } catch (value) {
      setError(value instanceof Error ? value.message : '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.logoBackground}>
        <Image source={require('../assets/images/ai-safe-route-logo.png')} style={styles.logo} />
      </View>
      <Text style={styles.title}>로그인</Text>
      <Text style={styles.description}>계정에 로그인하고 안전 경로 서비스를 이용하세요.</Text>
      <Text style={styles.label}>아이디</Text>
      <TextInput value={username} onChangeText={setUsername} placeholder="아이디를 입력해 주세요" placeholderTextColor="#7A8984" autoCapitalize="none" style={styles.input} />
      <Text style={styles.label}>비밀번호</Text>
      <TextInput value={password} onChangeText={setPassword} placeholder="비밀번호를 입력해 주세요" placeholderTextColor="#7A8984" secureTextEntry style={styles.input} />
      {error && <Text style={styles.error}>{error}</Text>}
      <PrimaryButton label="로그인" onPress={() => void submit()} loading={loading} disabled={!username || !password} />
      <Text style={styles.link} onPress={() => router.push('/register' as Href)}>계정이 없나요? 회원가입</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAF8', padding: 24 },
  logoBackground: { alignSelf: 'center', width: 94, height: 94, marginTop: 28, borderRadius: 28, backgroundColor: '#DDF1E8', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 72, height: 72, resizeMode: 'contain' },
  title: { fontSize: 30, fontWeight: '800', color: '#14251F', marginTop: 24 },
  description: { color: '#596A64', marginVertical: 16 },
  input: { color: '#14251F', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DCE7E2', borderRadius: 14, padding: 15, marginBottom: 12 },
  label: { color: '#263D35', fontSize: 14, fontWeight: '700', marginBottom: 7 },
  error: { color: '#B42318', marginBottom: 12 },
  link: { color: '#167C5A', fontWeight: '700', textAlign: 'center', marginTop: 20 },
});
