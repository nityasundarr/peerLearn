"""Detect and strip personal contact information from session message content.

Hard Rule 8: the messaging service must block phone numbers and email addresses
from being stored in or returned from session_messages.

Covers:
  - Singapore mobile numbers: 8/9XXXXXXX (8 digits starting with 8 or 9)
  - Singapore numbers with country code: +65 XXXX XXXX, 65-XXXX-XXXX, etc.
  - Generic international numbers: +CC (area) local
  - Any RFC-5321-style email address

Usage:
    from app.utils.contact_filter import contains_contact_info, strip_contact_info

    cleaned = strip_contact_info(user_message)
"""

import re

# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

# Singapore local: 8/9 followed by 7 more digits, optional internal separators
_SG_LOCAL = r"\b[89]\d{3}[\s\-]?\d{4}\b"

# Singapore with country code: +65 or 65, then the 8-digit number
_SG_INTL = r"(?:\+?65[\s\-]?)[89]\d{3}[\s\-]?\d{4}\b"

# Generic international: +CC (1–3 digits) then 7–12 digit subscriber number
# Allows spaces, hyphens, dots as separators; optional parentheses around area code
_INTL_GENERIC = (
    r"\+\d{1,3}[\s\-.]?"           # country code
    r"(?:\(\d{1,4}\)[\s\-.]?)?"    # optional area code in parens
    r"\d{3,5}[\s\-.]?\d{3,5}"      # subscriber number in 1–2 groups
)

# Email: standard RFC-ish pattern
_EMAIL = r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}"

# Combined, order matters: most-specific SG patterns before generic intl
_CONTACT_RE = re.compile(
    rf"(?:{_SG_INTL})|(?:{_SG_LOCAL})|(?:{_INTL_GENERIC})|(?:{_EMAIL})",
    re.IGNORECASE,
)

_PLACEHOLDER = "[contact info removed]"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def contains_contact_info(text: str) -> bool:
    """Return True if *text* contains any phone number or email address."""
    return bool(_CONTACT_RE.search(text))


def strip_contact_info(text: str) -> str:
    """Replace all detected phone numbers and email addresses with a placeholder.

    Multiple consecutive matches separated only by whitespace are collapsed
    into a single placeholder to avoid cluttered output.
    """
    # Replace each match individually first
    cleaned = _CONTACT_RE.sub(_PLACEHOLDER, text)

    # Collapse repeated adjacent placeholders (e.g. from "email phone" → two hits)
    _repeated = re.compile(
        r"(?:" + re.escape(_PLACEHOLDER) + r"\s*){2,}"
    )
    cleaned = _repeated.sub(_PLACEHOLDER + " ", cleaned)

    return cleaned.strip()
