import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Image, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/src/components/PrimaryButton';
import { useReportSubmission } from '@/src/features/report/useReportSubmission';
import type { RiskLevel } from '@/src/types/hazard';

const riskText: Record<RiskLevel,string>={none:'위험요소 없음',low:'낮은 위험',medium:'주의 필요',high:'통행 어려움'};
const riskColor: Record<RiskLevel,string>={none:'#167C5A',low:'#3B7A57',medium:'#B7791F',high:'#B42318'};
const labelText: Record<string,string>={
  person:'보행자',motor_vehicle:'차량',two_wheeler:'자전거·이륜차',mobility_aid:'이동 보조기구',
  movable_obstacle:'이동식 장애물',fixed_obstacle:'고정 장애물',
};
const labelColor: Record<string,string>={
  person:'#2563EB',motor_vehicle:'#DC2626',two_wheeler:'#EA580C',mobility_aid:'#7C3AED',
  movable_obstacle:'#D97706',fixed_obstacle:'#475569',
};

export default function ReportResultScreen(){
  const router=useRouter(); const {uri}=useLocalSearchParams<{uri:string}>(); const {state,submit}=useReportSubmission();
  useEffect(()=>{if(uri) void submit(uri);},[uri,submit]);
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    {uri&&<View style={styles.imageFrame}>
      <Image source={{uri}} style={styles.image}/>
      {state.status==='success'&&state.result.detections.filter(item=>item.on_walkway).map((item,index)=>{
        const [x1,y1,x2,y2]=item.box;
        const color=labelColor[item.label]??'#B42318';
        return <View key={`${item.label}-${index}`} pointerEvents="none" style={[styles.detectionBox,{
          left:`${x1*100}%`,top:`${y1*100}%`,width:`${Math.max(0,x2-x1)*100}%`,height:`${Math.max(0,y2-y1)*100}%`,borderColor:color,
        }]}>
          <Text style={[styles.detectionLabel,{backgroundColor:color}]} numberOfLines={1}>
            {labelText[item.label]??'장애물'}
          </Text>
        </View>;
      })}
    </View>}
    {state.status==='submitting'&&<View style={styles.box}><Text style={styles.title}>AI가 보행환경을 분석하고 있습니다.</Text><PrimaryButton label="분석 중" onPress={()=>{}} loading style={styles.button}/></View>}
    {state.status==='success'&&<View style={styles.box}>
      <Text style={[styles.risk,{color:riskColor[state.result.overall_risk]}]}>{riskText[state.result.overall_risk]}</Text>
      <Text style={styles.body}>감지된 위험</Text>
      {[...new Set(state.result.detections.filter(item=>item.on_walkway).map(item=>labelText[item.label]??'장애물'))].map(item=><Text key={item} style={styles.item}>• {item}</Text>)}
      {state.result.obstacles_on_walkway===0&&<Text style={styles.item}>보행을 방해하는 위험이 감지되지 않았습니다.</Text>}
      <PrimaryButton label="다른 사진 분석" onPress={()=>router.replace('/report/camera' as Href)} style={styles.button}/>
      <PrimaryButton label="홈으로" variant="dark" onPress={()=>router.replace('/' as Href)} style={styles.button}/>
    </View>}
    {state.status==='error'&&<View style={styles.box}><Text style={styles.error}>{state.message}</Text><PrimaryButton label="다시 시도" onPress={()=>uri&&void submit(uri)} style={styles.button}/></View>}
  </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#F7FAF8'},container:{padding:24},imageFrame:{width:'100%',height:300,borderRadius:20,backgroundColor:'#E7EFEB',overflow:'hidden'},image:{width:'100%',height:'100%',resizeMode:'stretch'},detectionBox:{position:'absolute',borderWidth:2},detectionLabel:{alignSelf:'flex-start',maxWidth:150,paddingHorizontal:5,paddingVertical:2,color:'#FFF',fontSize:10,fontWeight:'800'},box:{marginTop:20,backgroundColor:'#FFF',borderRadius:18,padding:20,borderWidth:1,borderColor:'#DCE7E2'},title:{fontSize:18,fontWeight:'800',color:'#14251F'},risk:{fontSize:26,fontWeight:'900',marginBottom:14},body:{color:'#596A64',lineHeight:22},item:{color:'#324A42',fontSize:13,lineHeight:20,marginTop:6},error:{color:'#B42318',lineHeight:21},button:{marginTop:14}});
