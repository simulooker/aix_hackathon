# API

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/health` | 서버 상태 확인 |
| POST | `/api/v1/reports` | 사진과 위치를 이용한 위험 신고 (AI 판별 후 자동 저장) |
| GET | `/api/v1/reports/nearby` | 주변 위험 신고 목록 조회 (`lat`, `lon`, `radius_m`) |
| POST | `/api/v1/detections` | 사진 위험 요소 판별만 단독 실행 |
| POST | `/api/v1/routes` | 출발지·목적지·프로필로 안심 우회 경로 요청 |

개발 서버를 실행하면 `/docs`에서 요청 형식을 직접 시험할 수 있습니다.

## `/api/v1/reports` (POST)

`multipart/form-data`: `image`, `latitude`, `longitude`.

내부에서 `ai_service`(YOLOv8 또는 대체 휴리스틱)로 사진을 분석해 `hazard_type`,
`confidence`, `severity(S_i)`를 계산하고, 심각도가 임계치 이상이면 즉시
`verified` 상태로 저장해 다른 사용자의 지도/경로에 바로 반영합니다.

## `/api/v1/routes` (POST)

```json
{
  "origin": { "latitude": 35.1768, "longitude": 126.9081 },
  "destination": { "latitude": 35.1800, "longitude": 126.9120 },
  "profile": "wheelchair"
}
```

`profile`은 `general | elderly | wheelchair` 중 하나이며, 각 프로필마다 보도 턱·
경사·결빙에 대한 통행 비용 가중치(`a`, `b`, `x`)가 다르게 적용됩니다. 응답은
`geometry`(경로 좌표 목록), `distance_m`, `hazards_avoided`(우회로 인해 피한
위험 신고 수)를 포함합니다.
