"""국가교통정보센터(ITS) 돌발상황정보 API 시연용 목 서버.

실제 https://openapi.its.go.kr:9443/eventInfo 와 동일한 요청/응답 형식을 흉내낸다.
재난 상황은 임의로 만들 수 없으므로, 시연 때 이 서버를 켜서 고정 데이터를 흘려보낸다.

실행:
    python services/api/mock/its_mock_server.py            # 기본 9500 포트
    python services/api/mock/its_mock_server.py --port 9600

백엔드 services/api/.env 에 아래를 추가하면 연결된다:
    DISASTER_API_URL=http://127.0.0.1:9500/eventInfo
    DISASTER_API_KEY=demo
"""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

FIXTURE_PATH = Path(__file__).with_name("its_disaster_fixture.json")


def _float(values: dict[str, list[str]], key: str) -> float | None:
    try:
        return float(values[key][0])
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def filtered_payload(query: dict[str, list[str]]) -> dict:
    """실제 API 처럼 bbox(minX/maxX/minY/maxY)로 걸러서 돌려준다."""
    payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    items = payload["body"]["items"]

    min_x, max_x = _float(query, "minX"), _float(query, "maxX")
    min_y, max_y = _float(query, "minY"), _float(query, "maxY")
    if None not in (min_x, max_x, min_y, max_y):
        items = [
            item
            for item in items
            if min_x <= float(item["coordX"]) <= max_x
            and min_y <= float(item["coordY"]) <= max_y
        ]

    event_type = (query.get("eventType") or ["all"])[0]
    if event_type == "dis":  # 재난만
        items = [item for item in items if item["eventType"] == "재난"]

    payload["body"]["items"] = items
    payload["body"]["totalCount"] = str(len(items))
    return payload


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") not in ("/eventInfo", ""):
            self.send_error(404, "Not Found")
            return

        query = parse_qs(parsed.query)
        payload = filtered_payload(query)
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        print(f"[its-mock] {format % args}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=9500)
    port = parser.parse_args().port

    print(f"[its-mock] 돌발상황정보 목 서버 실행 http://127.0.0.1:{port}/eventInfo")
    print(f"[its-mock] 데이터 파일: {FIXTURE_PATH}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
