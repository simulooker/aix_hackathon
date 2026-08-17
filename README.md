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
8. 도보·버스 선택, 직행/1회 환승 및 정류장별 이동 안내
9. 경로 고도 기반 예상 경사도와 이용자 유형별 경사 회피
10. Open-Meteo 날씨 경고와 공공 재난 통제 구간 표시·강제 우회

## 날씨·재난·버스 설정

- 날씨는 별도 키 없이 Open-Meteo를 사용하며 앱에 출처를 표시합니다.
- 버스 기능은 `apps/mobile/.env`의 `EXPO_PUBLIC_BUS_API_KEY` 하나로 TAGO의
  정류소·노선·도착·위치 API를 호출합니다. 각 API에 대해 data.go.kr 활용신청이 필요합니다.
- 재난 우회는 운영 API의 `DISASTER_API_URL`과 Secret Manager의
  `DISASTER_API_KEY`가 모두 설정된 경우에만 활성화됩니다. 공공데이터포털에서
  실시간 도로 재난·통제 API 승인을 받은 뒤 제공된 요청 주소를 등록해야 합니다.
- 경사도는 ORS가 제공하는 지형 고도를 사용한 추정치입니다. 짧은 턱, 연석,
  건물 출입구 경사처럼 수 미터 단위의 장애를 정밀 측정하는 값은 아닙니다.

운영 API는 Cloud Run, 모바일 APK와 OTA 업데이트는 Expo EAS로 배포합니다.

## Git 규칙

- `main`: 실행 가능한 통합 코드
- `feature/기능명`: 기능 개발
- `fix/문제명`: 버그 수정

모델, 데이터셋, `.env`, 개인 키는 `.gitignore`에 의해 제외됩니다.
