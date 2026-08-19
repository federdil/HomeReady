"""
Supabase JWT verification using the Supabase Admin client.
Calls supabase.auth.get_user(token) which validates server-side — no JWT secret needed.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client
from app.core.config import get_settings

bearer = HTTPBearer(auto_error=False)

# Stable identity used for every request while DEV_NO_AUTH is on, so local data
# (journey progress, shortlist, checklist) persists across restarts.
DEV_USER_ID = "00000000-0000-0000-0000-0000000000de"


def _dev_bypass_active() -> bool:
    settings = get_settings()
    return settings.dev_no_auth and settings.environment == "development"


def _supabase_client():
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_key)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> str:
    if _dev_bypass_active():
        return DEV_USER_ID

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
    if _dev_bypass_active():
        return DEV_USER_ID

    if not credentials:
        return None
    try:
        client = _supabase_client()
        response = client.auth.get_user(credentials.credentials)
        return str(response.user.id) if response.user else None
    except Exception:
        return None  # always swallow — optional auth never blocks the request
