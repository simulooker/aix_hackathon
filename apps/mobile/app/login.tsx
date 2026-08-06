import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TextInput } from 'react-native';

import { PrimaryButton } from '@/src/components/PrimaryButton';
import { login } from '@/src/services/api';

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    setLoading(true); setError(undefined);
    try { await login(username.trim(), password); router.replace('/' as Href); }
    catch (value) { setError(value instanceof Error ? value.message : '로그인에 실패했습니다.'); }
    finally { setLoading(false); }
  };
  return <SafeAreaView style={styles.container}>
    <Text style={styles.title}>로그인</Text><Text style={styles.description}>AI 안전길 서비스를 이용하려면 로그인하세요.</Text>
    <TextInput value={username} onChangeText={setUsername} placeholder="아이디" autoCapitalize="none" style={styles.input} />
    <TextInput value={password} onChangeText={setPassword} placeholder="비밀번호" secureTextEntry style={styles.input} />
    {error && <Text style={styles.error}>{error}</Text>}
    <PrimaryButton label="로그인" onPress={() => void submit()} loading={loading} disabled={!username || !password} />
    <Text style={styles.link} onPress={() => router.push('/register' as Href)}>계정이 없나요? 회원가입</Text>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ container:{flex:1,backgroundColor:'#F7FAF8',padding:24},title:{fontSize:30,fontWeight:'800',color:'#14251F',marginTop:36},description:{color:'#596A64',marginVertical:16},input:{backgroundColor:'#FFF',borderWidth:1,borderColor:'#DCE7E2',borderRadius:14,padding:15,marginBottom:12},error:{color:'#B42318',marginBottom:12},link:{color:'#167C5A',fontWeight:'700',textAlign:'center',marginTop:20} });
