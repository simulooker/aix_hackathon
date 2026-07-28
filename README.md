# AI 안심길 안내

보행 중 발견되는 위험 요소를 사진으로 신고하고, AI 분석 결과와 공간 데이터를
활용해 더 안전한 이동 경로를 안내하는 해커톤 프로젝트입니다.

## 저장소 구성

- `apps/mobile`: React Native, Expo Router, TypeScript 모바일 앱
- `services/api`: FastAPI, YOLO, OSMnx, NetworkX 서버
- `supabase`: PostgreSQL/PostGIS 마이그레이션
- `docs`: 구조, API, 데이터베이스 문서

## 시작하기

### 모바일 앱

```powershell
npm install
Copy-Item .env.example .env
npm run mobile
```

Expo Go에서 QR 코드를 스캔하거나 Android 에뮬레이터를 사용합니다. 실제 휴대폰에서
서버에 접속할 때는 `EXPO_PUBLIC_API_URL`의 `localhost`를 개발 PC의 내부 IP 주소로
변경해야 합니다.

### API 서버

Python 3.12 설치 후 아래 명령을 실행합니다.

```powershell
cd services/api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

- API 상태: `http://localhost:8000/health`
- API 문서: `http://localhost:8000/docs`

## 첫 개발 순서

1. 모바일 앱에서 현재 위치 표시
2. 사진 선택 또는 촬영
3. FastAPI로 신고 전송
4. Supabase Storage와 PostGIS 저장
5. YOLO 분석 연결
6. OSMnx/NetworkX 경로 계산 연결
7. 지도 경로 및 음성 안내

## 브랜치 규칙

- `main`: 항상 실행 가능한 코드
- `feature/기능명`: 기능 개발
- `fix/문제명`: 버그 수정

커밋 예시: `feat: 현재 위치 지도 표시`
