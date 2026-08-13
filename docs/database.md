# 데이터베이스 구조

초기 마이그레이션은 `hazard_reports` 테이블을 생성합니다.

- 좌표는 `latitude`, `longitude`로 저장
- AI 결과는 `hazard_type`, `confidence`, `severity`, `overall_risk`에 저장
- 검증된 신고만 일반 사용자에게 공개
- 사진 원본은 Storage에 저장하고 DB에는 경로만 저장
- 기존 PostGIS 기반 테이블은 서버 시작 시 데이터를 보존하며 현재 구조로 보완
