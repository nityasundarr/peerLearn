"""UC-3.4 — After tutor profile create/update, match open tutoring requests.

Runs a simplified overlap check (subjects, academic level, planning areas)
against all `tutoring_requests` with status `open`, creates a session when
a match is found, notifies the tutee, and marks the request `matched`.
"""

from __future__ import annotations

from app.db import notifications_db, tutor_profile_db
from app.db.sessions_db import create_session
from app.db.supabase_client import supabase


def _lower_set(items: list | None) -> set[str]:
    return {str(x).strip().lower() for x in (items or []) if x}


def _subjects_overlap(tutor_subjects: list | None, request_subjects: list | None) -> bool:
    ts = _lower_set(tutor_subjects)
    rs = _lower_set(request_subjects)
    return bool(ts & rs)


def _academic_level_matches(tutor_levels: list | None, request_level: str | None) -> bool:
    if not request_level:
        return False
    tl = _lower_set(tutor_levels)
    return str(request_level).strip().lower() in tl


def _planning_areas_overlap(tutor_areas: list | None, request_areas: list | None) -> bool:
    ta = _lower_set(tutor_areas)
    ra = _lower_set(request_areas)
    if not ta or not ra:
        return False
    return bool(ta & ra)


def _session_exists_for_request(request_id: str) -> bool:
    try:
        result = (
            supabase.table("tutoring_sessions")
            .select("id")
            .eq("request_id", str(request_id))
            .limit(1)
            .execute()
        )
        return bool(result and result.data)
    except Exception:
        return True  # fail safe: skip creating duplicate


def match_open_requests_for_tutor(tutor_id: str) -> None:
    """Run simplified matching for one tutor against all open requests.

    Safe to call after POST/PUT /tutor-profile; failures are logged and do not
    raise (profile save must still succeed).
    """
    return  # Sessions are created only when tutee selects a tutor
