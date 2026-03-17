"""Pydantic v2 schemas for the venues module.

Hard Rule 10: lat/lng are NEVER present in any response model.
The distance_bucket field replaces raw distances.
"""

from pydantic import BaseModel


class VenueItem(BaseModel):
    """One venue in a recommendation list.

    Hard Rule 10: no lat, no lng, no numeric km — only distance_bucket.
    """
    venue_id: str
    name: str
    address: str
    planning_area: str
    venue_type: str
    accessibility_features: list[str]
    opening_hours: dict | None
    distance_bucket: str        # Near | Medium | Far (never raw km or coordinates)
    suitability_score: float    # 0–100 composite (distance + type + accessibility)
    source: str | None

    @classmethod
    def from_db(cls, row: dict, distance_bucket: str, score: float) -> "VenueItem":
        return cls(
            venue_id=row["id"],
            name=row.get("name", ""),
            address=row.get("address", ""),
            planning_area=row.get("planning_area", ""),
            venue_type=row.get("venue_type", ""),
            accessibility_features=row.get("accessibility_features") or [],
            opening_hours=row.get("opening_hours"),
            distance_bucket=distance_bucket,
            suitability_score=round(score, 1),
            source=row.get("source"),
        )


class VenueListResponse(BaseModel):
    """Returned by GET /venues/recommend."""
    venues: list[VenueItem]
    total: int
    message: str | None
