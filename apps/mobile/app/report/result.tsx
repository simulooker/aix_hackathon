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
  const router=useRouter(); const {uri,latitude,longitude}=useLocalSearchParams<{uri:string;latitude:string;longitude:string}>(); const {state,submit}=useReportSubmission();
  useEffect(()=>{if(uri&&latitude&&longitude) void submit(uri,Number(latitude),Number(longitude));},[uri,latitude,longitude,submit]);
  const visibleDetections=state.status==='success'?state.result.detections.filter(item=>item.on_walkway):[];
  const detectedKinds=[...new Map(visibleDetections.map(item=>[item.label,item])).values()];
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    {uri&&<View style={styles.imageFrame}>
      <Image source={{uri}} style={styles.image}/>
      {visibleDetections.map((item,index)=>{
        const [x1,y1,x2,y2]=item.box??[0,0,0,0];
        const color=labelColor[item.label]??'#B42318';
        const labelBelow=y1<0.08;
        return <View key={`${item.label}-${index}`} pointerEvents="none" style={styles.detectionLayer}>
          <View style={[styles.detectionBox,{
            left:`${x1*100}%`,top:`${y1*100}%`,width:`${Math.max(0,x2-x1)*100}%`,height:`${Math.max(0,y2-y1)*100}%`,borderColor:color,
          }]}/>
          <Text style={[styles.detectionLabel,{backgroundColor:color,left:`${Math.min(x1,0.72)*100}%`,top:`${(labelBelow?y2:y1)*100}%`,transform:[{translateY:labelBelow?2:-19}]}]} numberOfLines={1}>
            {labelText[item.label]??'장애물'}
          </Text>
        </View>;
      })}
    </View>}
    {state.status==='submitting'&&<View style={styles.box}><Text style={styles.title}>AI가 보행환경을 분석하고 있습니다.</Text><PrimaryButton label="분석 중" onPress={()=>{}} loading style={styles.button}/></View>}
    {state.status==='success'&&<View style={styles.box}>
      <Text style={[styles.risk,{color:riskColor[state.result.overall_risk]}]}>{riskText[state.result.overall_risk]}</Text>
      <Text style={styles.body}>감지된 위험</Text>
      {detectedKinds.map(item=><View key={item.label} style={styles.legendItem}>
        <View style={[styles.legendSwatch,{backgroundColor:labelColor[item.label]??'#B42318'}]}/>
        <Text style={styles.item}>{labelText[item.label]??'장애물'}</Text>
      </View>)}
      {state.result.obstacles_on_walkway===0&&<Text style={styles.item}>보행을 방해하는 위험이 감지되지 않았습니다.</Text>}
      {state.result.status==='not_saved'&&<Text style={styles.notSaved}>위험요소가 없어 사진과 위치 정보는 서버에 저장하지 않았습니다.</Text>}
      <PrimaryButton label="다른 사진 분석" onPress={()=>router.replace('/report/camera' as Href)} style={styles.button}/>
      <PrimaryButton label="홈으로" variant="dark" onPress={()=>router.replace('/' as Href)} style={styles.button}/>
    </View>}
    {state.status==='error'&&<View style={styles.box}><Text style={styles.error}>{state.message}</Text><PrimaryButton label="다시 시도" onPress={()=>uri&&latitude&&longitude&&void submit(uri,Number(latitude),Number(longitude))} style={styles.button}/></View>}
  </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#F7FAF8'},container:{padding:24},imageFrame:{width:'100%',height:300,borderRadius:20,backgroundColor:'#E7EFEB',overflow:'hidden'},image:{width:'100%',height:'100%',resizeMode:'stretch'},detectionLayer:{...StyleSheet.absoluteFillObject},detectionBox:{position:'absolute',borderWidth:1},detectionLabel:{position:'absolute',maxWidth:150,paddingHorizontal:5,paddingVertical:2,color:'#FFF',fontSize:10,fontWeight:'800'},box:{marginTop:20,backgroundColor:'#FFF',borderRadius:18,padding:20,borderWidth:1,borderColor:'#DCE7E2'},title:{fontSize:18,fontWeight:'800',color:'#14251F'},risk:{fontSize:26,fontWeight:'900',marginBottom:14},body:{color:'#596A64',lineHeight:22},legendItem:{flexDirection:'row',alignItems:'center',gap:8,marginTop:6},legendSwatch:{width:11,height:11,borderRadius:2},item:{color:'#324A42',fontSize:13,lineHeight:20},notSaved:{marginTop:10,padding:10,borderRadius:10,color:'#52645E',backgroundColor:'#EEF3F0',fontSize:12,lineHeight:18},error:{color:'#B42318',lineHeight:21},button:{marginTop:14}});
