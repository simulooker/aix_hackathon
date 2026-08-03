# 데이터베이스

`hazard_reports` 테이블과 PostGIS 공간 인덱스, 주변 검색용 RPC 함수를
마이그레이션으로 관리합니다.

- 좌표는 `geography(point, 4326)`으로 저장
- AI 결과는 `hazard_type`, `confidence`, `severity`(S_i, 0~1)에 저장
- 심각도가 임계치 이상이면 API 단에서 자동으로 `verified`, 그 외에는 `pending`
- 사진 원본은 Storage 버킷(`hazard-photos`)에 저장하고 DB에는 경로만 저장
- `nearby_hazards(search_lat, search_lon, radius_m)`: 반경 내 위험 신고를
  위도/경도가 풀린 형태로 반환 (경로 계산과 지도 조회 양쪽에서 사용)

Supabase 프로젝트가 설정되어 있지 않으면(`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
미설정) API 서버는 사진을 `services/api/uploads/`에, 신고 목록을 메모리에 보관하는
로컬 폴백으로 자동 전환됩니다. 데모 도중에는 그대로 동작하지만 서버를 재시작하면
초기화됩니다.
