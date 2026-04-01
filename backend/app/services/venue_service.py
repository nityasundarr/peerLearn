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
import time

import httpx

from app.core.config import settings
from app.db import venues_db
from app.models.venue import VenueItem, VenueListResponse
from app.services.location_service import (
    _get_centroid,  # Internal use — computes distance from stored coords
    _haversine_km,
    _km_to_bucket,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# OneMap token management — auto-refresh when expired
# ---------------------------------------------------------------------------

_ONEMAP_TOKEN_URL = "https://www.onemap.gov.sg/api/auth/post/getToken"

# Module-level token cache: {"token": str, "expires_at": float (unix timestamp)}
_token_cache: dict = {"token": "", "expires_at": 0.0}


async def _get_onemap_token() -> str:
    """Return a valid OneMap Bearer token, refreshing automatically if expired.

    Priority:
      1. Cached token that is still valid (>5 min buffer)
      2. settings.ONEMAP_API_KEY if not empty and not expired
      3. Auto-refresh via ONEMAP_EMAIL + ONEMAP_PASSWORD credentials
      4. Empty string (OneMap calls will be skipped)
    """
    now = time.time()
    buffer = 300  # 5-minute safety buffer

    # Use cached token if still valid
    if _token_cache["token"] and _token_cache["expires_at"] > now + buffer:
        return _token_cache["token"]

    # Seed cache from settings on first call (parse expiry from JWT payload)
    if settings.ONEMAP_API_KEY and not _token_cache["token"]:
        try:
            import base64, json as _json
            parts = settings.ONEMAP_API_KEY.split(".")
            if len(parts) == 3:
                # Decode JWT payload (add padding if needed)
                payload_b64 = parts[1] + "=="
                payload = _json.loads(base64.urlsafe_b64decode(payload_b64))
                exp = float(payload.get("exp", 0))
                _token_cache["token"] = settings.ONEMAP_API_KEY
                _token_cache["expires_at"] = exp
                if exp > now + buffer:
                    return _token_cache["token"]
        except Exception as exc:
            logger.debug("Could not parse ONEMAP_API_KEY JWT expiry: %s", exc)
            # Treat as non-expiring for now
            _token_cache["token"] = settings.ONEMAP_API_KEY
            _token_cache["expires_at"] = now + 86400
            return _token_cache["token"]

    # Token expired or not set — try to refresh via credentials
    if settings.ONEMAP_EMAIL and settings.ONEMAP_PASSWORD:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    _ONEMAP_TOKEN_URL,
                    json={"email": settings.ONEMAP_EMAIL, "password": settings.ONEMAP_PASSWORD},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    new_token = data.get("access_token", "")
                    exp_ts = float(data.get("expiry_timestamp", now + 259200))
                    _token_cache["token"] = new_token
                    _token_cache["expires_at"] = exp_ts
                    logger.info("OneMap token refreshed; expires at %s", exp_ts)
                    return new_token
                else:
                    logger.warning("OneMap token refresh failed: %s %s", resp.status_code, resp.text)
        except httpx.RequestError as exc:
            logger.warning("OneMap token refresh request failed: %s", exc)

    # Return whatever token we have, even if expired (will likely get 401)
    return _token_cache.get("token", "") or settings.ONEMAP_API_KEY


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

# Map tutee accessibility_needs strings → venue feature keys required to satisfy them.
# If a tutee has a need and the venue lacks the required feature, the venue is heavily
# penalised so it sinks to the bottom of the recommendation list.
_NEED_TO_FEATURE: dict[str, str] = {
    "wheelchair accessible venue required": "wheelchair_accessible",
    "ground floor / lift access required": "lift_access",
    "hearing assistance / quiet environment needed": "hearing_loop",
    "visual aids / good lighting required": "good_lighting",
}


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------

def _score_venue(
    venue: dict,
    tutee_areas: list[str],
    tutor_areas: list[str],
    tutee_needs: list[str] | None = None,
) -> tuple[float, str]:
    """Return (suitability_score 0-100, distance_bucket) for a venue.

    Uses venue.lat / venue.lng for precise distance if available.
    Falls back to planning_area centroid distance if not.
    Hard Rule 10: these coordinates never leave this function.

    tutee_needs: list of accessibility need strings from the tutoring request.
      Each need is mapped to a required venue feature via _NEED_TO_FEATURE.
      A venue missing any required feature has its accessibility score set to 0,
      causing it to rank below venues that satisfy all needs.
    """
    vtype = venue.get("venue_type", "")
    type_score = _TYPE_SCORES.get(vtype, 40.0)

    # Distance scoring: compute distance from each party's centroid to venue,
    # then use the AVERAGE (not minimum) so venues equidistant to both parties
    # score better than venues only close to one party.
    # Bonus: if the venue is in a planning area both parties chose, add 10 pts.
    venue_lat = venue.get("lat")
    venue_lng = venue.get("lng")
    venue_planning_area = (venue.get("planning_area") or "").lower()

    tutee_kms: list[float] = []
    tutor_kms: list[float] = []

    def _dist_from_area(area: str) -> float | None:
        centroid = _get_centroid(area)
        if not centroid:
            return None
        if venue_lat and venue_lng:
            return _haversine_km(centroid[0], centroid[1], float(venue_lat), float(venue_lng))
        vcent = _get_centroid(venue.get("planning_area", ""))
        if not vcent:
            return None
        return _haversine_km(centroid[0], centroid[1], vcent[0], vcent[1])

    for area in tutee_areas:
        d = _dist_from_area(area)
        if d is not None:
            tutee_kms.append(d)
    for area in tutor_areas:
        d = _dist_from_area(area)
        if d is not None:
            tutor_kms.append(d)

    # Best distance from each party (closest area they chose)
    tutee_best = min(tutee_kms) if tutee_kms else None
    tutor_best = min(tutor_kms) if tutor_kms else None

    if tutee_best is not None and tutor_best is not None:
        avg_km = (tutee_best + tutor_best) / 2
    elif tutee_best is not None:
        avg_km = tutee_best
    elif tutor_best is not None:
        avg_km = tutor_best
    else:
        avg_km = None

    if avg_km is None:
        bucket = "Medium"
        distance_score = 60.0
    else:
        bucket = _km_to_bucket(avg_km)
        distance_score = {"Near": 100.0, "Medium": 60.0, "Far": 20.0}.get(bucket, 40.0)

    # Bonus for venues in areas both parties explicitly chose (common ground)
    tutee_area_set = {a.lower() for a in tutee_areas}
    tutor_area_set = {a.lower() for a in tutor_areas}
    if venue_planning_area and venue_planning_area in tutee_area_set & tutor_area_set:
        distance_score = min(distance_score + 10.0, 100.0)

    # Accessibility score: match tutee needs against venue features.
    access_feats = {f.lower() for f in (venue.get("accessibility_features") or [])}

    if tutee_needs:
        # Build the set of feature keys this tutee requires
        required_features = set()
        for need in tutee_needs:
            feat = _NEED_TO_FEATURE.get(need.lower())
            if feat:
                required_features.add(feat)

        if required_features:
            missing = required_features - access_feats
            if missing:
                # Venue cannot satisfy at least one hard accessibility requirement
                access_score = 0.0
            else:
                # All requirements met — full score
                access_score = 100.0
        else:
            # Needs were specified but none mapped to a known feature (e.g. free-text notes)
            # Fall back to presence check
            access_score = 100.0 if access_feats else 50.0
    else:
        # No accessibility needs — reward venues that have features anyway
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

# Keywords that indicate a venue is NOT a suitable study location.
# OneMap's elastic search returns broad matches (e.g. "community centre TAMPINES"
# returns PCF Sparkletots preschools because they share addresses with CCs).
_BLOCKLIST_KEYWORDS = [
    "sparkletots", "sparkle tots",
    "preschool", "pre-school",
    "kindergarten",
    "childcare", "child care",
    "pcf ", "pcf@",
    "nurserycreche",
    "infant care",
    "playgroup",
]


async def _fetch_onemap_venues(area: str) -> list[dict]:
    """Query OneMap API for study venues near a planning area.

    Returns raw venue dicts with lat/lng — caller must strip before any response.
    Falls back to empty list on any error.
    Automatically retries once with a refreshed token on 401.
    """
    token = await _get_onemap_token()
    if not token:
        logger.info(
            "OneMap API key not configured; skipping live venue fetch. "
            "Set ONEMAP_API_KEY or ONEMAP_EMAIL+ONEMAP_PASSWORD in .env."
        )
        return []

    def _parse_results(raw_results: list, term: str) -> list[dict]:
        out = []
        for r in raw_results:
            try:
                lat = float(r.get("LATITUDE") or 0)
                lng = float(r.get("LONGITUDE") or r.get("LONGTITUDE") or 0)  # handle OneMap typo
                if lat == 0 or lng == 0:
                    continue
                name = r.get("SEARCHVAL", r.get("BUILDING", ""))
                address = r.get("ADDRESS", "")
                # Skip venues that are clearly not suitable study locations
                combined = (name + " " + address).lower()
                if any(kw in combined for kw in _BLOCKLIST_KEYWORDS):
                    continue
                out.append({
                    "name": name,
                    "address": address,
                    "planning_area": area,
                    "lat": lat,    # Internal only — never in response
                    "lng": lng,    # Internal only — never in response
                    "venue_type": _ONEMAP_VENUE_TYPES.get(term.lower(), "study_area"),
                    "accessibility_features": [],
                    "opening_hours": None,
                    "source": "onemap",
                    "id": f"onemap-{r.get('POSTAL', '')}",
                })
            except (ValueError, KeyError):
                continue
        return out

    venues: list[dict] = []
    refreshed = False

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

                # Token expired — refresh once and retry
                if resp.status_code == 401 and not refreshed and settings.ONEMAP_EMAIL:
                    logger.info("OneMap token expired; attempting refresh")
                    _token_cache["expires_at"] = 0.0  # force refresh
                    token = await _get_onemap_token()
                    refreshed = True
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
                    logger.debug("OneMap search returned %s for '%s %s'", resp.status_code, term, area)
                    continue

                data = resp.json()
                venues.extend(_parse_results(data.get("results", []), term))

            except httpx.RequestError as exc:
                logger.warning("OneMap API call failed for '%s %s': %s", term, area, exc)

    return venues


# ---------------------------------------------------------------------------
# Main recommendation function
# ---------------------------------------------------------------------------

async def recommend_venues(
    request_id: str | None = None,
    tutor_id: str | None = None,
) -> VenueListResponse:
    """Return ranked venue recommendations.

    Uses request_id for tutee planning areas (tutoring_requests) and
    tutor_id for tutor planning areas (tutor_profiles). If either is
    missing or not found, still returns seeded venues with distance_bucket
    defaulting to "Medium".

    Hard Rule 10: lat/lng only used internally; stripped before response.
    """
    tutee_areas: list[str] = []
    tutor_areas: list[str] = []
    tutee_needs: list[str] = []

    if request_id:
        from app.db.requests_db import get_request_by_id
        req = get_request_by_id(request_id)
        if req:
            tutee_areas = req.get("planning_areas") or []
            tutee_needs = req.get("accessibility_needs") or []

    if tutor_id:
        from app.db.tutor_profile_db import get_profile
        profile = get_profile(tutor_id)
        if profile:
            tutor_areas = profile.get("planning_areas") or []

    all_areas = list(dict.fromkeys(tutee_areas + tutor_areas))  # deduplicated

    # Query local venues DB (with internal coords for scoring) — filtered by planning areas
    local_venues = venues_db._get_venues_with_coords(all_areas, limit=50)

    # Fetch from OneMap if configured
    onemap_venues: list[dict] = []
    if settings.ONEMAP_API_KEY:
        for area in all_areas[:3]:  # limit API calls
            try:
                results = await _fetch_onemap_venues(area)
                onemap_venues.extend(results)
            except Exception as exc:
                logger.warning("OneMap fetch failed for area '%s': %s", area, exc)

    # Merge, deduplicate by name+address
    all_venues = local_venues.copy()
    seen_keys: set[str] = {f"{v.get('name', '')}:{v.get('address', '')}" for v in local_venues}
    for v in onemap_venues:
        key = f"{v.get('name', '')}:{v.get('address', '')}"
        if key not in seen_keys:
            all_venues.append(v)
            seen_keys.add(key)

    # Fallback: when OneMap key missing, API failed, or no results — use all DB venues
    if not all_venues:
        logger.info("No venues from OneMap or area-filtered DB; falling back to all seeded venues")
        fallback_venues = venues_db.get_all_venues_for_fallback(limit=50)
        # Fallback venues have no lat/lng; _score_venue uses planning_area centroid distance
        all_venues = fallback_venues

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
        score, bucket = _score_venue(venue, tutee_areas, tutor_areas, tutee_needs)
        scored.append((score, bucket, venue))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:10]

    # Build response — VenueItem.from_db strips lat/lng automatically (not in its fields)
    items = [VenueItem.from_db(v, bucket, score) for score, bucket, v in top]

    return VenueListResponse(venues=items, total=len(items), message=None)
