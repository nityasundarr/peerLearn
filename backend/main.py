from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import admin as admin_router
from app.api.routes import appeals as appeals_router
from app.api.routes import auth as auth_router
from app.api.routes import complaints as complaints_router
from app.api.routes import dashboard as dashboard_router
from app.api.routes import matching as matching_router
from app.api.routes import messaging as messaging_router
from app.api.routes import notifications as notifications_router
from app.api.routes import payments as payments_router
from app.api.routes import ratings as ratings_router
from app.api.routes import requests as requests_router
from app.api.routes import sessions as sessions_router
from app.api.routes import tutor_profile as tutor_profile_router
from app.api.routes import users as users_router
from app.api.routes import venues as venues_router
from app.core.config import settings
from app.core.errors import register_exception_handlers

app = FastAPI(
    title="PeerLearn API",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth_router.router)
app.include_router(users_router.router)
app.include_router(dashboard_router.router)
app.include_router(notifications_router.router)
app.include_router(tutor_profile_router.router)
app.include_router(requests_router.router)
app.include_router(matching_router.router)
app.include_router(sessions_router.router)
app.include_router(messaging_router.router)
app.include_router(venues_router.router)
app.include_router(payments_router.router)
app.include_router(ratings_router.router)
app.include_router(complaints_router.router)
app.include_router(appeals_router.router)
app.include_router(admin_router.router)


@app.get("/health", tags=["health"])
async def health_check():
    return {"status": "ok"}
