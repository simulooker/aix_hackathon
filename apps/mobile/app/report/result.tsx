import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Image, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/src/components/PrimaryButton';
import { useReportSubmission } from '@/src/features/report/useReportSubmission';
import type { RiskLevel } from '@/src/types/hazard';

const riskText: Record<RiskLevel,string>={none:'위험요소 없음',low:'낮은 위험',medium:'주의 필요',high:'통행 어려움'};
const riskColor: Record<RiskLevel,string>={none:'#167C5A',low:'#3B7A57',medium:'#B7791F',high:'#B42318'};

export default function ReportResultScreen(){
  const router=useRouter(); const {uri}=useLocalSearchParams<{uri:string}>(); const {state,submit}=useReportSubmission();
  useEffect(()=>{if(uri) void submit(uri);},[uri]);
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    {uri&&<Image source={{uri}} style={styles.image}/>}
    {state.status==='submitting'&&<View style={styles.box}><Text style={styles.title}>AI가 보행환경을 분석하고 있습니다.</Text><PrimaryButton label="분석 중" onPress={()=>{}} loading style={styles.button}/></View>}
    {state.status==='success'&&<View style={styles.box}>
      <Text style={[styles.risk,{color:riskColor[state.result.overall_risk]}]}>{riskText[state.result.overall_risk]}</Text>
      <Text style={styles.body}>보행로 인식: {state.result.walkway_detected?'성공':'인식하지 못함'}</Text>
      <Text style={styles.body}>전체 탐지 물체: {state.result.obstacles_detected}개</Text>
      <Text style={styles.body}>보행로 위 물체: {state.result.obstacles_on_walkway}개</Text>
      {state.result.detections.filter(item=>item.on_walkway).slice(0,5).map((item,index)=><Text key={`${item.label}-${index}`} style={styles.item}>• {item.label} · 신뢰도 {Math.round(item.confidence*100)}% · 차단 {Math.round(item.blocked_walkway_ratio*100)}%</Text>)}
      <PrimaryButton label="다른 사진 분석" onPress={()=>router.replace('/report/camera' as Href)} style={styles.button}/>
      <PrimaryButton label="홈으로" variant="dark" onPress={()=>router.replace('/' as Href)} style={styles.button}/>
    </View>}
    {state.status==='error'&&<View style={styles.box}><Text style={styles.error}>{state.message}</Text><PrimaryButton label="다시 시도" onPress={()=>uri&&void submit(uri)} style={styles.button}/></View>}
  </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#F7FAF8'},container:{padding:24},image:{width:'100%',height:300,borderRadius:20,backgroundColor:'#E7EFEB'},box:{marginTop:20,backgroundColor:'#FFF',borderRadius:18,padding:20,borderWidth:1,borderColor:'#DCE7E2'},title:{fontSize:18,fontWeight:'800',color:'#14251F'},risk:{fontSize:26,fontWeight:'900',marginBottom:14},body:{color:'#596A64',lineHeight:22},item:{color:'#324A42',fontSize:13,lineHeight:20,marginTop:6},error:{color:'#B42318',lineHeight:21},button:{marginTop:14}});
