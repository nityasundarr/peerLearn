"""Reusable field validators for Pydantic v2 models.

Usage in a model:
    from app.utils.validators import validate_edu_sg_email, validate_full_name, validate_password
    from pydantic import field_validator

    class RegisterRequest(BaseModel):
        email: str
        full_name: str
        password: str

        _email    = field_validator("email")(validate_edu_sg_email)
        _name     = field_validator("full_name")(validate_full_name)
        _password = field_validator("password")(validate_password)
"""

import re

# ---------------------------------------------------------------------------
# Compiled patterns
# ---------------------------------------------------------------------------

# Accepts any valid local-part @ any subdomain ending in .edu.sg
_EDU_SG_RE = re.compile(r"^[^@\s]+@[^@\s]+\.edu\.sg$", re.IGNORECASE)

# Full name: letters, spaces, hyphens, apostrophes — 1 to 100 chars
_NAME_RE = re.compile(r"^[A-Za-z '\-]{1,100}$")

# Password complexity sub-patterns
_HAS_UPPER = re.compile(r"[A-Z]")
_HAS_LOWER = re.compile(r"[a-z]")
_HAS_NUM_OR_SPECIAL = re.compile(r"[0-9!@#$%^&*()\-_=+\[\]{}|;:',.<>?/\\`~]")

_PASSWORD_MIN_LEN = 8

# Free-text field pattern (subjects, topics, planning areas, review text)
# Letters, digits, spaces, hyphens, apostrophes
_FREE_TEXT_RE = re.compile(r"^[A-Za-z0-9 '\-]{1,100}$")


# ---------------------------------------------------------------------------
# Validator functions — each accepts a value and returns it clean, or raises
# ---------------------------------------------------------------------------

def validate_edu_sg_email(value: str) -> str:
    """Hard Rule 1: every email-accepting endpoint must use this validator."""
    v = value.strip().lower()
    if not _EDU_SG_RE.match(v):
        raise ValueError("Only .edu.sg email addresses are accepted.")
    return v


def validate_full_name(value: str) -> str:
    """SRS 2.1.1: [A-Za-z \\-'], 1–100 chars."""
    v = value.strip()
    if not _NAME_RE.match(v):
        raise ValueError(
            "Full name must be 1–100 characters and contain only letters, "
            "spaces, hyphens, and apostrophes."
        )
    return v


def validate_password(value: str) -> str:
    """SRS 2.1.1: min 8 chars, ≥1 uppercase, ≥1 lowercase, ≥1 number or special char."""
    if len(value) < _PASSWORD_MIN_LEN:
        raise ValueError(f"Password must be at least {_PASSWORD_MIN_LEN} characters.")
    if not _HAS_UPPER.search(value):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not _HAS_LOWER.search(value):
        raise ValueError("Password must contain at least one lowercase letter.")
    if not _HAS_NUM_OR_SPECIAL.search(value):
        raise ValueError(
            "Password must contain at least one number or special character."
        )
    return value


def validate_free_text(value: str, max_len: int = 100) -> str:
    """Generic validator for custom subject/topic/area text fields.

    SRS 2.2.2.2–2.2.2.5: [A-Za-z0-9 \\-'], 1 to max_len chars.
    """
    v = value.strip()
    pattern = re.compile(rf"^[A-Za-z0-9 '\-]{{1,{max_len}}}$")
    if not pattern.match(v):
        raise ValueError(
            f"Value must be 1–{max_len} characters and contain only "
            "letters, digits, spaces, hyphens, and apostrophes."
        )
    return v
