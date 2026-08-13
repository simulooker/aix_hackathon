# 위드유

보행로 사진을 AI로 분석하고 주변 위험정보와 안전 경로를 안내하는 Expo + FastAPI 프로젝트입니다.

## 구성

- `apps/mobile`: React Native, Expo Router, TypeScript 모바일 앱
- `services/api`: FastAPI 인증·AI 분석·경로 API
- `supabase`: PostgreSQL/PostGIS 마이그레이션
- `docs`: 구조와 API 문서

## 1. 모바일 앱 실행

```powershell
npm install
Copy-Item apps/mobile/.env.example apps/mobile/.env
npm run mobile
```

휴대폰의 Expo Go를 사용할 때는 `apps/mobile/.env`의 주소를 개발 PC의 내부 IP로 바꿔야 합니다.

```env
EXPO_PUBLIC_API_URL=http://192.168.0.10:8000
```

Android 에뮬레이터에서는 보통 `http://10.0.2.2:8000`을 사용합니다.

## 2. API 서버 실행

Python 3.10 이상이 필요합니다.

```powershell
cd services/api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0
```

- 상태 확인: `http://localhost:8000/health`
- API 문서: `http://localhost:8000/docs`
- 로컬 DB: `services/api/local.db`

## 3. AI 모델 연결

모델 파일은 GitHub에 올리지 않습니다. 다음 이름으로 로컬 API 폴더에 복사합니다.

```text
services/api/models/surface-seg-best.pt
services/api/models/obstacle-detect-best.pt
```

서버에서 내려받는 예시:

```powershell
scp -P 10000 jn_hack15@155.230.135.209:/abr/jn_hack15/results/surface-seg-v2/weights/best.pt services/api/models/surface-seg-best.pt
scp -P 10000 jn_hack15@155.230.135.209:/abr/jn_hack15/results/obstacle-detect-v1/weights/best.pt services/api/models/obstacle-detect-best.pt
```

GPU 서버에서는 `.env`의 값을 다음처럼 바꿉니다.

```env
AI_DEVICE=0
```

모델이 없으면 앱의 다른 기능은 실행되지만 사진 분석 API는 `503`과 함께 누락된 모델 경로를 알려줍니다.

## 주요 기능

1. 이메일 인증 기반 회원가입과 로그인
2. 카카오맵 장소 후보 검색과 목적지 선택
3. OpenStreetMap 보행망과 A* 기반 실제 도보 경로 계산
4. 제보된 위험 위치를 반영한 이용자 유형별 안전 경로 추천
5. GPS 기반 이전·현재·다음 회전 안내 및 음성 안내
6. 사진의 보행로 세그멘테이션과 장애물 탐지
7. 제보 사진은 Supabase Storage, 위치·위험도는 PostgreSQL에 저장

운영 API는 Cloud Run, 모바일 APK와 OTA 업데이트는 Expo EAS로 배포합니다.

## Git 규칙

- `main`: 실행 가능한 통합 코드
- `feature/기능명`: 기능 개발
- `fix/문제명`: 버그 수정

모델, 데이터셋, `.env`, 개인 키는 `.gitignore`에 의해 제외됩니다.
