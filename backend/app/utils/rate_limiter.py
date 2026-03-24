"""In-memory sliding-window rate limiter.

Hard Rule 7: POST /auth/resend-verification and POST /auth/forgot-password
must be limited to settings.RATE_LIMIT_EMAIL_MAX requests per hour per email.

Usage:
    from app.utils.rate_limiter import check_rate_limit
    from app.core.errors import RateLimitError

    check_rate_limit(email)   # raises RateLimitError if limit exceeded
"""

import time
from collections import defaultdict
from threading import Lock

from app.core.config import settings
from app.core.errors import RateLimitError

_WINDOW_SECONDS: int = 3600  # 1 hour

# email (lowercase) → list of UTC timestamps of recent requests
_store: dict[str, list[float]] = defaultdict(list)
_lock = Lock()


def check_rate_limit(email: str) -> None:
    """Raise RateLimitError if the email has exceeded the hourly cap.

    Uses a sliding window: only requests within the past hour count.
    Thread-safe via a module-level lock.
    """
    key = email.strip().lower()
    now = time.time()
    cutoff = now - _WINDOW_SECONDS

    with _lock:
        # Evict timestamps outside the sliding window
        _store[key] = [ts for ts in _store[key] if ts > cutoff]

        if len(_store[key]) >= settings.RATE_LIMIT_EMAIL_MAX:
            raise RateLimitError(
                f"Maximum {settings.RATE_LIMIT_EMAIL_MAX} requests per hour "
                "allowed for this email address. Please try again later."
            )

        _store[key].append(now)


def get_remaining(email: str) -> int:
    """Return how many requests the email address has left in the current window."""
    key = email.strip().lower()
    now = time.time()
    cutoff = now - _WINDOW_SECONDS

    with _lock:
        recent = [ts for ts in _store[key] if ts > cutoff]
        return max(0, settings.RATE_LIMIT_EMAIL_MAX - len(recent))
