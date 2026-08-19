from uuid import uuid4

import httpx

from app.core.config import settings


async def upload_report_image(
    contents: bytes, content_type: str, filename: str | None
) -> str | None:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return None

    extension = (filename or "photo.jpg").rsplit(".", 1)[-1].lower()
    if extension not in {"jpg", "jpeg", "png", "webp"}:
        extension = "jpg"

    object_path = f"reports/{uuid4()}.{extension}"
    base_url = settings.supabase_url.rstrip("/")
    bucket_name = settings.supabase_report_bucket

    url = f"{base_url}/storage/v1/object/{bucket_name}/{object_path}"
    headers = {
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "apikey": settings.supabase_service_role_key,
        "Content-Type": content_type,
        "x-upsert": "false",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, headers=headers, content=contents)
        if response.status_code == 404:
            bucket_response = await client.post(
                f"{base_url}/storage/v1/bucket",
                headers={
                    "Authorization": f"Bearer {settings.supabase_service_role_key}",
                    "apikey": settings.supabase_service_role_key,
                    "Content-Type": "application/json",
                },
                json={
                    "id": bucket_name,
                    "name": bucket_name,
                    "public": True,  # 앱/웹에서 사진 조회를 위해 공개 버킷으로 생성
                },
            )
            if bucket_response.is_success or bucket_response.status_code == 409:
                response = await client.post(url, headers=headers, content=contents)

        response.raise_for_status()

    # 앱과 프론트엔드에서 바로 로드 가능한 Supabase Storage 공개 URL 반환
    public_url = f"{base_url}/storage/v1/object/public/{bucket_name}/{object_path}"
    return public_url


async def download_report_image(object_path: str) -> tuple[bytes, str]:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("Supabase Storage가 설정되지 않았습니다.")

    base_url = settings.supabase_url.rstrip("/")
    bucket_name = settings.supabase_report_bucket
    
    # 전체 URL로 전달된 경우 내부 상대 경로만 추출
    clean_path = object_path
    if f"/storage/v1/object/public/{bucket_name}/" in clean_path:
        clean_path = clean_path.split(f"/storage/v1/object/public/{bucket_name}/")[-1]
    elif f"/storage/v1/object/authenticated/{bucket_name}/" in clean_path:
        clean_path = clean_path.split(f"/storage/v1/object/authenticated/{bucket_name}/")[-1]
    clean_path = clean_path.lstrip("/")

    url = f"{base_url}/storage/v1/object/authenticated/{bucket_name}/{clean_path}"
    headers = {
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "apikey": settings.supabase_service_role_key,
    }

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(url, headers=headers)
        if response.status_code == 404:
            # 공개 URL 형태로 재시도
            public_fetch_url = f"{base_url}/storage/v1/object/public/{bucket_name}/{clean_path}"
            response = await client.get(public_fetch_url, headers=headers)

    response.raise_for_status()
    return response.content, response.headers.get("content-type", "image/jpeg")