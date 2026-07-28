# 시스템 구조

```text
Expo 모바일 앱
  ├─ GPS / 지도 / 사진 / 음성
  └─ HTTPS
       ↓
FastAPI (Cloud Run 서울 리전)
  ├─ YOLO 위험 요소 판별
  ├─ OSMnx + NetworkX A* 경로 계산
  └─ Supabase 연결
       ↓
Supabase
  ├─ PostgreSQL + PostGIS
  └─ Storage
```

모바일 앱에는 Supabase `anon` 키만 사용합니다. `service_role` 키와 AI 모델은 반드시
FastAPI 서버에서만 사용합니다.
