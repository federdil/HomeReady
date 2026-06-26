"""
Auth-related routes: identity + journey persistence.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.core.auth import get_current_user

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class MeResponse(BaseModel):
    user_id: str


@router.get("/me", response_model=MeResponse)
async def me(user_id: str = Depends(get_current_user)):
    return MeResponse(user_id=user_id)
