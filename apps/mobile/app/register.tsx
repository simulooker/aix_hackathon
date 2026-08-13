import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { PrimaryButton } from '@/src/components/PrimaryButton';
import { register, sendEmailOtp, verifyEmailOtp } from '@/src/services/api';

export default function RegisterScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const run = async (work: () => Promise<void>) => {
    setLoading(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await work();
    } catch (value) {
      setError(value instanceof Error ? value.message : '요청을 처리하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const requestOtp = () =>
    run(async () => {
      if (!username.trim() || !password) {
        throw new Error('아이디와 비밀번호를 먼저 입력해 주세요.');
      }
      const normalized = email.trim();
      await sendEmailOtp(normalized);
      setOtpSent(true);
      setVerified(false);
      setMessage('인증번호를 이메일로 보냈습니다.');
    });

  const confirmOtp = () =>
    run(async () => {
      if (!username.trim() || !password) {
        throw new Error('아이디와 비밀번호를 먼저 입력해 주세요.');
      }
      await verifyEmailOtp(email.trim(), code.trim());
      setVerified(true);
      setMessage('이메일 인증이 완료되었습니다.');
    });

  const submit = () =>
    run(async () => {
      await register({ username: username.trim(), email: email.trim(), password });
      router.replace('/login' as Href);
    });

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>회원가입</Text>
      <Text style={styles.description}>이메일 인증 후 계정을 만들어 주세요.</Text>

      <Text style={styles.label}>아이디</Text>
      <TextInput
        value={username}
        onChangeText={setUsername}
        placeholder="사용할 아이디를 입력해 주세요"
        placeholderTextColor="#7A8984"
        autoCapitalize="none"
        style={styles.input}
      />
      <Text style={styles.label}>비밀번호</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="비밀번호 (영문·숫자·특수문자 포함 8자 이상)"
        placeholderTextColor="#7A8984"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="newPassword"
        autoComplete="new-password"
        style={styles.input}
      />
      <Text style={styles.label}>이메일</Text>
      <View style={styles.row}>
        <TextInput
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setVerified(false);
          }}
          placeholder="인증할 이메일을 입력해 주세요"
          placeholderTextColor="#7A8984"
          autoCapitalize="none"
          keyboardType="email-address"
          style={[styles.input, styles.flexInput]}
        />
        <TouchableOpacity style={styles.smallButton} onPress={() => void requestOtp()} disabled={!username || !password || !email || loading}>
          <Text style={styles.smallButtonText}>인증 요청</Text>
        </TouchableOpacity>
      </View>

      {otpSent && (
        <View>
          <Text style={styles.label}>이메일 인증번호</Text>
          <View style={styles.row}>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="6자리 인증번호"
            placeholderTextColor="#7A8984"
            keyboardType="number-pad"
            maxLength={6}
            style={[styles.input, styles.flexInput]}
          />
          <TouchableOpacity style={styles.smallButton} onPress={() => void confirmOtp()} disabled={!username || !password || !code || loading}>
            <Text style={styles.smallButtonText}>확인</Text>
          </TouchableOpacity>
          </View>
        </View>
      )}

      {message && <Text style={styles.success}>{message}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
      <PrimaryButton
        label="계정 만들기"
        onPress={() => void submit()}
        loading={loading}
        disabled={!username || !password || !verified}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAF8', padding: 24 },
  title: { fontSize: 30, fontWeight: '800', color: '#14251F', marginTop: 36 },
  description: { color: '#596A64', lineHeight: 21, marginVertical: 16 },
  row: { flexDirection: 'row', gap: 8 },
  flexInput: { flex: 1 },
  input: {
    color: '#14251F',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#DCE7E2',
    borderRadius: 14,
    padding: 15,
    marginBottom: 12,
  },
  label: { color: '#263D35', fontSize: 14, fontWeight: '700', marginBottom: 7 },
  smallButton: {
    height: 50,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#176B4D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonText: { color: '#FFF', fontWeight: '700' },
  success: { color: '#176B4D', marginBottom: 12 },
  error: { color: '#B42318', marginBottom: 12 },
});
