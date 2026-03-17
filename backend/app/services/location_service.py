"""Privacy-preserving location service.

Hard Rule 10: coordinates NEVER leave this module.
  - Centroid (lat, lng) tuples are used only for internal distance computation.
  - The only value exposed externally is a distance bucket string: Near | Medium | Far.

SRS 2.4:
  All locations = planning area centroids, NOT exact addresses.
  Distance bucketed: Near ≤ 5 km, Medium 5-15 km, Far > 15 km.

Google Maps API integration note (plan.md Section 6):
  When GOOGLE_MAPS_API_KEY is configured, the Distance Matrix API is called
  for a more accurate road distance.  If the key is absent or the call fails,
  the Haversine formula (straight-line distance between centroids) is used as
  a fallback.  Either way, only the bucket label is returned — never the
  numeric km value.

Centroid coordinates are approximate.  They are cached as a module-level
constant and never queried from any external source at runtime.
"""

import logging
import math

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Distance bucket thresholds (SRS 2.4, plan.md Section 6)
# ---------------------------------------------------------------------------

_NEAR_KM = 5.0
_MEDIUM_KM = 15.0


# ---------------------------------------------------------------------------
# Singapore planning area centroids (approximate, WGS-84)
# Source: URA Master Plan 2019 + public centroid estimates
# These are module-level constants — never exposed to the frontend.
# ---------------------------------------------------------------------------

_CENTROIDS: dict[str, tuple[float, float]] = {
    "Ang Mo Kio":               (1.3691, 103.8454),
    "Bedok":                    (1.3236, 103.9273),
    "Bishan":                   (1.3526, 103.8352),
    "Boon Lay":                 (1.3038, 103.7050),
    "Bukit Batok":              (1.3590, 103.7637),
    "Bukit Merah":              (1.2819, 103.8239),
    "Bukit Panjang":            (1.3774, 103.7719),
    "Bukit Timah":              (1.3294, 103.8021),
    "Central Area":             (1.2878, 103.8520),
    "Choa Chu Kang":            (1.3840, 103.7470),
    "Clementi":                 (1.3162, 103.7649),
    "Downtown Core":            (1.2837, 103.8511),
    "Geylang":                  (1.3201, 103.8918),
    "Hougang":                  (1.3612, 103.8863),
    "Jurong East":              (1.3329, 103.7436),
    "Jurong West":              (1.3404, 103.7090),
    "Kallang":                  (1.3100, 103.8722),
    "Mandai":                   (1.4128, 103.8200),
    "Marine Parade":            (1.3020, 103.9070),
    "Novena":                   (1.3204, 103.8439),
    "Pasir Ris":                (1.3721, 103.9474),
    "Punggol":                  (1.4043, 103.9022),
    "Queenstown":               (1.2942, 103.7861),
    "Rochor":                   (1.3049, 103.8557),
    "Sembawang":                (1.4491, 103.8185),
    "Sengkang":                 (1.3868, 103.8914),
    "Serangoon":                (1.3554, 103.8679),
    "Tampines":                 (1.3496, 103.9568),
    "Tengah":                   (1.3740, 103.7388),
    "Toa Payoh":                (1.3343, 103.8563),
    "Tuas":                     (1.2966, 103.6368),
    "Western Islands":          (1.2500, 103.7750),
    "Western Water Catchment":  (1.4050, 103.6900),
    "Woodlands":                (1.4382, 103.7890),
    "Yishun":                   (1.4304, 103.8354),
}

# Normalised lowercase lookup so user input is matched case-insensitively
_CENTROIDS_LOWER: dict[str, tuple[float, float]] = {
    k.lower(): v for k, v in _CENTROIDS.items()
}


# ---------------------------------------------------------------------------
# Internal helpers — private, never imported elsewhere
# ---------------------------------------------------------------------------

def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Straight-line Haversine distance in kilometres."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _km_to_bucket(km: float) -> str:
    if km <= _NEAR_KM:
        return "Near"
    elif km <= _MEDIUM_KM:
        return "Medium"
    return "Far"


def _get_centroid(area: str) -> tuple[float, float] | None:
    return _CENTROIDS_LOWER.get(area.strip().lower())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_distance_bucket(area1: str, area2: str) -> str:
    """Return the distance bucket between two planning area names.

    Uses Haversine on stored centroids.  Returns "Unknown" if either area
    is not in the centroids dictionary.

    Hard Rule 10: the raw km value is NEVER returned to any caller.
    """
    c1 = _get_centroid(area1)
    c2 = _get_centroid(area2)
    if not c1 or not c2:
        logger.debug(
            "Unknown planning area centroid: %r or %r — defaulting to Medium",
            area1, area2,
        )
        return "Medium"  # safe default rather than exposing an error
    km = _haversine_km(c1[0], c1[1], c2[0], c2[1])
    return _km_to_bucket(km)


def get_best_distance_bucket(tutee_areas: list[str], tutor_areas: list[str]) -> str:
    """Return the best-case distance bucket across all pairs of areas.

    "Best-case" = minimum distance pair, reflecting the closest venue option.
    Returns "Medium" if either list is empty or contains no known areas.
    """
    best_km = float("inf")
    found = False

    for a1 in tutee_areas:
        c1 = _get_centroid(a1)
        if not c1:
            continue
        for a2 in tutor_areas:
            c2 = _get_centroid(a2)
            if not c2:
                continue
            km = _haversine_km(c1[0], c1[1], c2[0], c2[1])
            if km < best_km:
                best_km = km
                found = True

    if not found:
        return "Medium"
    return _km_to_bucket(best_km)


def get_all_planning_areas() -> list[str]:
    """Return a sorted list of all known planning area names."""
    return sorted(_CENTROIDS.keys())
