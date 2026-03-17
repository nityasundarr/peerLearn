"""Supabase query functions for the venues domain.

Hard Rule 3: all DB access via supabase.table(...).  No raw SQL.
Hard Rule 10: lat/lng are NEVER selected in public-facing queries.
  _PUBLIC_COLS explicitly omits lat and lng.
  _INTERNAL_COLS includes them for distance computation inside venue_service only —
  this function must never be called from a route handler or response model.

Table: venues
  id, name, address, planning_area, lat, lng, accessibility_features,
  venue_type, opening_hours, source
"""

import logging

from app.core.errors import AppError
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)

# Hard Rule 10: public columns — lat and lng are intentionally excluded
_PUBLIC_COLS = (
    "id, name, address, planning_area, accessibility_features, "
    "venue_type, opening_hours, source"
)

# Internal only — includes coordinates for distance computation in venue_service
# Must never be passed to a response model
_INTERNAL_COLS = _PUBLIC_COLS + ", lat, lng"


def _db_error(operation: str, exc: Exception) -> AppError:
    logger.error("DB error during %s: %s", operation, exc, exc_info=True)
    return AppError(500, "A database error occurred. Please try again.")


# ---------------------------------------------------------------------------
# Public queries (no lat/lng)
# ---------------------------------------------------------------------------

def get_venues_by_planning_area(area: str, limit: int = 20) -> list[dict]:
    """Return venues in a given planning area. No coordinates in output."""
    try:
        result = (
            supabase.table("venues")
            .select(_PUBLIC_COLS)
            .eq("planning_area", area)
            .in_("venue_type", ["library", "community_centre", "study_area"])
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        raise _db_error("get_venues_by_planning_area", exc) from exc


def get_venues_by_planning_areas(areas: list[str], limit: int = 50) -> list[dict]:
    """Return venues in any of the given planning areas. No coordinates."""
    if not areas:
        return []
    try:
        result = (
            supabase.table("venues")
            .select(_PUBLIC_COLS)
            .in_("planning_area", areas)
            .in_("venue_type", ["library", "community_centre", "study_area"])
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        raise _db_error("get_venues_by_planning_areas", exc) from exc


def get_venue_by_id(venue_id: str) -> dict | None:
    """Return a single venue by ID. No coordinates."""
    try:
        result = (
            supabase.table("venues")
            .select(_PUBLIC_COLS)
            .eq("id", venue_id)
            .maybe_single()
            .execute()
        )
        return result.data
    except Exception as exc:
        raise _db_error("get_venue_by_id", exc) from exc


# ---------------------------------------------------------------------------
# Internal query — DO NOT expose to route handlers or response models
# ---------------------------------------------------------------------------

def _get_venues_with_coords(areas: list[str], limit: int = 50) -> list[dict]:
    """Return venues including lat/lng for internal distance computation only.

    Hard Rule 10: this function is prefixed with _ to mark it as private.
    Call only from venue_service.py.  Never include lat/lng in any API response.
    """
    if not areas:
        return []
    try:
        result = (
            supabase.table("venues")
            .select(_INTERNAL_COLS)
            .in_("planning_area", areas)
            .in_("venue_type", ["library", "community_centre", "study_area"])
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        raise _db_error("_get_venues_with_coords", exc) from exc


def insert_venue(data: dict) -> dict:
    """Insert a new venue row (used by OneMap import in venue_service).

    Callers are responsible for including lat/lng in data for storage.
    This data is never returned via any public endpoint.
    """
    try:
        result = (
            supabase.table("venues")
            .insert(data)
            .select(_PUBLIC_COLS)
            .execute()
        )
        return result.data[0]
    except Exception as exc:
        raise _db_error("insert_venue", exc) from exc
