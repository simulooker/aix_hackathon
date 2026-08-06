import * as ImagePicker from 'expo-image-picker';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/src/components/PrimaryButton';

export default function ReportCameraScreen() {
  const router = useRouter();
  const [imageUri, setImageUri] = useState<string>();

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { Alert.alert('카메라 권한 필요', '사진을 촬영하려면 카메라 권한을 허용해 주세요.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };
  const choosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  };
  const analyze = () => {
    if (!imageUri) return;
    router.push({ pathname: '/report/result', params: { uri: imageUri } } as unknown as Href);
  };

  return <SafeAreaView style={styles.container}>
    <Text style={styles.title}>보행환경 AI 분석</Text>
    <Text style={styles.description}>보행 방향을 향해 길과 장애물이 함께 나오도록 촬영해 주세요.</Text>
    <View style={styles.preview}>{imageUri ? <Image source={{uri:imageUri}} style={styles.image}/> : <Text style={styles.placeholder}>선택한 사진이 없습니다.</Text>}</View>
    <PrimaryButton label="카메라로 촬영" onPress={()=>void takePhoto()}/>
    <PrimaryButton label="앨범에서 선택" variant="dark" onPress={()=>void choosePhoto()} style={styles.button}/>
    <PrimaryButton label="AI 분석하기" onPress={analyze} disabled={!imageUri} style={styles.button}/>
  </SafeAreaView>;
}
const styles=StyleSheet.create({container:{flex:1,backgroundColor:'#F7FAF8',padding:24},title:{color:'#14251F',fontSize:28,fontWeight:'800',marginTop:18},description:{color:'#596A64',fontSize:15,lineHeight:23,marginTop:10},preview:{height:280,backgroundColor:'#E7EFEB',borderRadius:20,marginVertical:24,alignItems:'center',justifyContent:'center',overflow:'hidden'},image:{width:'100%',height:'100%'},placeholder:{color:'#71817B'},button:{marginTop:12}});
