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
    try:
        profile = tutor_profile_db.get_profile(tutor_id)
        if not profile:
            return
        if not profile.get("is_active_mode", True):
            return

        open_result = (
            supabase.table("tutoring_requests")
            .select("*")
            .eq("status", "open")
            .execute()
        )
        open_rows = open_result.data if open_result and open_result.data else []
        print(f"[Matching] Checking {len(open_rows)} open requests against new tutor profile")

        topics_result = (
            supabase.table("tutor_topics")
            .select("subject")
            .eq("tutor_id", str(tutor_id))
            .execute()
        )
        tutor_subjects = list({
            str(row["subject"]).strip().lower()
            for row in (topics_result.data or [])
            if row.get("subject")
        })
        tutor_levels = [str(x).strip().lower() for x in (profile.get("academic_levels") or [])]
        tutor_areas = [str(x).strip().lower() for x in (profile.get("planning_areas") or [])]

        print(f"[Matching] tutor_subjects={tutor_subjects}")
        print(f"[Matching] tutor_levels={tutor_levels}")
        print(f"[Matching] tutor_areas={tutor_areas}")

        for request in open_rows:
            req_id = request.get("id")
            if not req_id:
                continue
            if request.get("tutee_id") == tutor_id:
                continue
            if _session_exists_for_request(str(req_id)):
                continue

            req_subjects_lower = [str(s).strip().lower() for s in (request.get("subjects") or [])]
            if not any(s in tutor_subjects for s in req_subjects_lower):
                continue
            req_level_lower = str(request.get("academic_level") or "").strip().lower()
            if not req_level_lower or req_level_lower not in tutor_levels:
                continue
            req_areas_lower = [str(a).strip().lower() for a in (request.get("planning_areas") or [])]
            if not any(a in tutor_areas for a in req_areas_lower):
                continue

            print(f"[Matching] Found match for request {req_id}")

            tutee_id = request.get("tutee_id")
            if not tutee_id:
                continue

            academic_level = str(request.get("academic_level") or "")
            dur = request.get("duration_hours")
            try:
                duration_hours = int(dur) if dur is not None else 1
            except (TypeError, ValueError):
                duration_hours = 1

            try:
                session_row = create_session(
                    str(req_id),
                    str(tutee_id),
                    str(tutor_id),
                    academic_level,
                    duration_hours,
                )
            except Exception as exc:
                print(f"[Matching] create_session failed for request {req_id}: {exc}")
                continue

            subjects = request.get("subjects") or []
            subject_label = subjects[0] if subjects else "your subject"

            title = "A matching tutor has been found!"
            message = (
                f"A tutor matching your request for {subject_label} has been "
                "found. Check My Learning to review and confirm."
            )

            notifications_db.create_notification(
                str(tutee_id),
                "tutor_matched",
                title,
                message,
                is_mandatory=False,
            )

            try:
                supabase.table("tutoring_requests").update({"status": "matched"}).eq(
                    "id", str(req_id)
                ).eq("status", "open").execute()
            except Exception as exc:
                print(f"[Matching] Failed to mark request {req_id} matched: {exc}")

    except Exception as exc:
        print(f"[Matching] match_open_requests_for_tutor error: {exc}")
