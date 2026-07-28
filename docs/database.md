# 데이터베이스 초안

초기 마이그레이션은 `hazard_reports` 테이블과 PostGIS 공간 인덱스를 생성합니다.

- 좌표는 `geography(point, 4326)`으로 저장
- AI 결과는 `hazard_type`, `confidence`에 저장
- 검증된 신고만 일반 사용자에게 공개
- 사진 원본은 Storage에 저장하고 DB에는 경로만 저장
