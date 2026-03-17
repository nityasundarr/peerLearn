"""Venue recommendation service.

SRS 2.8 rules:
  - Recommend only libraries, community centres, and study areas
  - Never return lat/lng to frontend — only distance_bucket
  - OneMap API key from settings.ONEMAP_API_KEY (never hardcoded)
  - Score venues by: distance (50%), venue type (30%), accessibility (20%)
  - Fallback: use local venues table if OneMap is unavailable

Hard Rule 10: coordinates remain inside this module only.
  venues_db._get_venues_with_coords is the only place that loads coords;
  they are used for distance computation and immediately discarded.
"""

import logging

import httpx

from app.core.config import settings
from app.core.errors import AppError, NotFoundError
from app.db import sessions_db, venues_db
from app.models.venue import VenueItem, VenueListResponse
from app.services.location_service import (
    _get_centroid,  # Internal use — computes distance from stored coords
    _haversine_km,
    _km_to_bucket,
)

logger = logging.getLogger(__name__)

# Venue type suitability scores (SRS 2.8: only public academic venues)
_TYPE_SCORES: dict[str, float] = {
    "library": 100.0,
    "community_centre": 80.0,
    "study_area": 70.0,
}

# Weights for composite suitability score
_W_DISTANCE = 0.50
_W_TYPE = 0.30
_W_ACCESSIBILITY = 0.20


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def _score_venue(
    venue: dict,
    tutee_areas: list[str],
    tutor_areas: list[str],
) -> tuple[float, str]:
    """Return (suitability_score 0-100, distance_bucket) for a venue.

    Uses venue.lat / venue.lng for precise distance if available.
    Falls back to planning_area centroid distance if not.
    Hard Rule 10: these coordinates never leave this function.
    """
    vtype = venue.get("venue_type", "")
    type_score = _TYPE_SCORES.get(vtype, 40.0)

    # Distance: minimum of (tutee→venue, tutor→venue)
    best_km: float | None = None
    venue_lat = venue.get("lat")
    venue_lng = venue.get("lng")

    for area in tutee_areas + tutor_areas:
        centroid = _get_centroid(area)
        if centroid:
            if venue_lat and venue_lng:
                km = _haversine_km(centroid[0], centroid[1], float(venue_lat), float(venue_lng))
            else:
                # Fallback: distance between planning area centroids
                vcent = _get_centroid(venue.get("planning_area", ""))
                if not vcent:
                    continue
                km = _haversine_km(centroid[0], centroid[1], vcent[0], vcent[1])
            if best_km is None or km < best_km:
                best_km = km

    if best_km is None:
        bucket = "Medium"
        distance_score = 60.0
    else:
        bucket = _km_to_bucket(best_km)
        distance_score = {"Near": 100.0, "Medium": 60.0, "Far": 20.0}.get(bucket, 40.0)

    # Accessibility score: simple check — does the venue have any features listed?
    access_feats = venue.get("accessibility_features") or []
    access_score = 100.0 if access_feats else 50.0

    composite = (
        _W_DISTANCE * distance_score
        + _W_TYPE * type_score
        + _W_ACCESSIBILITY * access_score
    )
    return composite, bucket


# ---------------------------------------------------------------------------
# OneMap API integration
# ---------------------------------------------------------------------------

_ONEMAP_SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search"
_VENUE_SEARCH_TERMS = ["public library", "community centre", "study area"]
_ONEMAP_VENUE_TYPES = {
    "public library": "library",
    "library": "library",
    "community centre": "community_centre",
    "community center": "community_centre",
    "study area": "study_area",
}


async def _fetch_onemap_venues(area: str) -> list[dict]:
    """Query OneMap API for study venues near a planning area.

    Returns raw venue dicts with lat/lng — caller must strip before any response.
    Falls back to empty list on any error.
    """
    token = settings.ONEMAP_API_KEY
    if not token:
        return []

    venues: list[dict] = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        for term in _VENUE_SEARCH_TERMS:
            try:
                resp = await client.get(
                    _ONEMAP_SEARCH_URL,
                    params={
                        "searchVal": f"{term} {area}",
                        "returnGeom": "Y",
                        "getAddrDetails": "Y",
                        "pageNum": 1,
                    },
                    headers={"Authorization": f"Bearer {token}"},
                )
                if resp.status_code != 200:
                    continue
                data = resp.json()
                for r in data.get("results", []):
                    try:
                        lat = float(r.get("LATITUDE") or 0)
                        lng = float(r.get("LONGITUDE") or 0)
                        if lat == 0 or lng == 0:
                            continue
                        venues.append(
                            {
                                "name": r.get("SEARCHVAL", ""),
                                "address": r.get("ADDRESS", ""),
                                "planning_area": area,
                                "lat": lat,    # Internal only — never in response
                                "lng": lng,    # Internal only — never in response
                                "venue_type": _ONEMAP_VENUE_TYPES.get(term.lower(), "study_area"),
                                "accessibility_features": [],
                                "opening_hours": None,
                                "source": "onemap",
                                "id": f"onemap-{r.get('POSTAL', '')}",
                            }
                        )
                    except (ValueError, KeyError):
                        continue
            except httpx.RequestError as exc:
                logger.warning("OneMap API call failed for '%s %s': %s", term, area, exc)
    return venues


# ---------------------------------------------------------------------------
# Main recommendation function
# ---------------------------------------------------------------------------

async def recommend_venues(
    session_id: str,
    user_id: str,
) -> VenueListResponse:
    """Return ranked venue recommendations for a session.

    Fetches the session to get tutee/tutor planning areas, then queries
    the local venues table + OneMap (if configured).

    Hard Rule 10: lat/lng only used internally; stripped before response.
    """
    from app.db.sessions_db import get_session_for_participant

    session = get_session_for_participant(session_id, user_id)
    if not session:
        raise NotFoundError("Session not found or access denied.")

    if session.get("status") not in {"tutor_accepted", "pending_confirmation", "confirmed"}:
        raise AppError(
            422,
            "Venue recommendations are only available after the tutor has accepted.",
        )

    # Get tutee and tutor planning areas from the tutoring_request
    request_id = session.get("request_id")
    tutee_areas: list[str] = []
    tutor_areas: list[str] = []

    if request_id:
        from app.db.requests_db import get_request_by_id
        req = get_request_by_id(request_id)
        if req:
            tutee_areas = req.get("planning_areas") or []

    # Tutor planning areas from tutor_profiles
    tutor_id = session.get("tutor_id", "")
    if tutor_id:
        from app.db.tutor_profile_db import get_profile
        profile = get_profile(tutor_id)
        if profile:
            tutor_areas = profile.get("planning_areas") or []

    all_areas = list(dict.fromkeys(tutee_areas + tutor_areas))  # deduplicated

    # Query local venues DB (with internal coords for scoring)
    local_venues = venues_db._get_venues_with_coords(all_areas, limit=50)

    # Fetch from OneMap if configured
    onemap_venues: list[dict] = []
    for area in all_areas[:3]:  # limit API calls
        try:
            results = await _fetch_onemap_venues(area)
            onemap_venues.extend(results)
        except Exception as exc:
            logger.warning("OneMap fetch failed for area '%s': %s", area, exc)

    # Merge, deduplicate by name+address
    all_venues = local_venues.copy()
    seen_keys: set[str] = {f"{v['name']}:{v['address']}" for v in local_venues}
    for v in onemap_venues:
        key = f"{v.get('name', '')}:{v.get('address', '')}"
        if key not in seen_keys:
            all_venues.append(v)
            seen_keys.add(key)

    if not all_venues:
        return VenueListResponse(
            venues=[],
            total=0,
            message=(
                "No venues found in the selected planning areas. "
                "Try adjusting the session's planning areas or enter a manual venue."
            ),
        )

    # Score and sort — lat/lng used internally here, then dropped
    scored: list[tuple[float, str, dict]] = []
    for venue in all_venues:
        score, bucket = _score_venue(venue, tutee_areas, tutor_areas)
        scored.append((score, bucket, venue))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:10]

    # Build response — VenueItem.from_db strips lat/lng automatically (not in its fields)
    items = [VenueItem.from_db(v, bucket, score) for score, bucket, v in top]

    return VenueListResponse(venues=items, total=len(items), message=None)
