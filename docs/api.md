# API 초안

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/health` | 서버 상태 확인 |
| POST | `/api/v1/reports` | 사진과 위치를 이용한 위험 신고 |
| POST | `/api/v1/detections` | 사진 위험 요소 판별 |
| POST | `/api/v1/routes` | 출발지와 목적지로 안전 경로 요청 |

개발 서버를 실행하면 `/docs`에서 요청 형식을 직접 시험할 수 있습니다.
