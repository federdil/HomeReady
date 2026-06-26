"""
HomeReady — FastAPI application entry point.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.api.routes.features import router as features_router
from app.api.routes.auth import router as auth_router
from app.api.routes.checklist import router as checklist_router
import structlog

log = structlog.get_logger()
settings = get_settings()

app = FastAPI(
    title="HomeReady API",
    description="AI-powered first-time buyer companion",
    version="0.1.0",
    docs_url="/docs" if settings.environment == "development" else None,
)

# ── CORS ───────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ─────────────────────────────────────────────────────────────────
app.include_router(features_router)
app.include_router(auth_router)
app.include_router(checklist_router)


@app.on_event("startup")
async def startup():
    log.info("homeready_api_started", environment=settings.environment)


@app.get("/")
async def root():
    return {"message": "HomeReady API", "docs": "/docs"}
