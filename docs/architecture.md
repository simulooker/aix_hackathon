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

모바일 앱은 Supabase에 직접 연결하지 않고 FastAPI만 호출합니다. Supabase
`service_role` 키, 데이터베이스 접속 정보, SMTP 비밀번호와 AI 모델은 반드시
Cloud Run과 Secret Manager에서만 관리합니다.
