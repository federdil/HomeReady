"""
Supabase JWT verification using the Supabase Admin client.
Calls supabase.auth.get_user(token) which validates server-side — no JWT secret needed.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client
from app.core.config import get_settings

bearer = HTTPBearer(auto_error=False)


def _supabase_client():
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_key)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> str:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        client = _supabase_client()
        response = client.auth.get_user(credentials.credentials)
        user_id = response.user.id if response.user else None
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return str(user_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> str | None:
    if not credentials:
        return None
    try:
        client = _supabase_client()
        response = client.auth.get_user(credentials.credentials)
        return str(response.user.id) if response.user else None
    except Exception:
        return None  # always swallow — optional auth never blocks the request
