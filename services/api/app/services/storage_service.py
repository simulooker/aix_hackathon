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
    url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/{settings.supabase_report_bucket}/{object_path}"
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
                f"{settings.supabase_url.rstrip('/')}/storage/v1/bucket",
                headers={
                    "Authorization": f"Bearer {settings.supabase_service_role_key}",
                    "apikey": settings.supabase_service_role_key,
                    "Content-Type": "application/json",
                },
                json={
                    "id": settings.supabase_report_bucket,
                    "name": settings.supabase_report_bucket,
                    "public": False,
                },
            )
            if bucket_response.is_success or bucket_response.status_code == 409:
                response = await client.post(url, headers=headers, content=contents)
    response.raise_for_status()
    return object_path


async def download_report_image(object_path: str) -> tuple[bytes, str]:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("Supabase Storage가 설정되지 않았습니다.")
    url = (
        f"{settings.supabase_url.rstrip('/')}/storage/v1/object/authenticated/"
        f"{settings.supabase_report_bucket}/{object_path.lstrip('/')}"
    )
    headers = {
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "apikey": settings.supabase_service_role_key,
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(url, headers=headers)
    response.raise_for_status()
    return response.content, response.headers.get("content-type", "image/jpeg")
