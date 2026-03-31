from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Supabase
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Email
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = "noreply@peerlearn.edu.sg"
    FRONTEND_URL: str = "http://localhost:5173"

    # External APIs
    ONEMAP_API_KEY: str = ""          # JWT access token (3-day expiry) — auto-refreshed if credentials set
    ONEMAP_EMAIL: str = ""            # OneMap account email — used to auto-refresh expired token
    ONEMAP_PASSWORD: str = ""         # OneMap account password — used to auto-refresh expired token
    GOOGLE_MAPS_API_KEY: str = ""

    # Fee schedule (SGD per hour per academic level)
    FEE_PRIMARY: int = 10
    FEE_SECONDARY: int = 12
    FEE_JUNIOR_COLLEGE: int = 15
    FEE_POLYTECHNIC: int = 15
    FEE_ITE: int = 12
    FEE_UNIVERSITY: int = 18

    # Session coordination timeouts (hours)
    TUTOR_RESPONSE_WINDOW_HOURS: int = 48
    TUTEE_CONFIRM_WINDOW_HOURS: int = 24

    # Penalty appeal window (days)
    APPEAL_WINDOW_DAYS: int = 7

    # Rate limiting (max requests per hour per email)
    RATE_LIMIT_EMAIL_MAX: int = 3


settings = Settings()
