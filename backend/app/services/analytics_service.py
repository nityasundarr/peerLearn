"""Admin analytics business logic.

All aggregation is Python-side after fetching raw rows from analytics_db.
This avoids any raw SQL while keeping the code readable.

Hard Rule 3: no raw SQL — all DB calls go through analytics_db / matching_db.
"""

import io
import logging
from collections import Counter
from datetime import date, timedelta

from app.core.errors import UnprocessableError
from app.db import analytics_db
from app.db.matching_db import DEFAULT_WEIGHTS, WEIGHT_COMPONENTS, get_admin_weights
from app.models.admin import (
    ActivityItem,
    AreaCount,
    CriticalGap,
    DemandResponse,
    GapAnalysisResponse,
    GapItem,
    KPIs,
    OverviewResponse,
    SubjectCount,
    SupplyResponse,
    TopicCount,
    WeightsResponse,
    WeightsUpdateBody,
    WorkloadBands,
)

logger = logging.getLogger(__name__)

_DEFAULT_DAYS = 30
_SHORTAGE_THRESHOLD = 0.2   # subjects with > 20% shortage get a critical gap card
_HEAVY_LOAD = 0.7
_LIGHT_LOAD = 0.3


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _default_dates() -> tuple[str, str]:
    today = date.today()
    start = (today - timedelta(days=_DEFAULT_DAYS)).isoformat()
    return start, today.isoformat()


def _top_n(counter: Counter, n: int = 10) -> list[tuple[str, int]]:
    return counter.most_common(n)


def _avg(values: list[float]) -> float:
    return round(sum(values) / len(values), 2) if values else 0.0


# ---------------------------------------------------------------------------
# UC-8.1  Overview
# ---------------------------------------------------------------------------

def get_overview() -> OverviewResponse:
    total_users = analytics_db.count_total_users()
    pending_requests = analytics_db.count_pending_requests()
    sessions_this_week = analytics_db.count_sessions_this_week()

    tutors = analytics_db.get_all_tutor_profiles()
    active_tutors = sum(1 for t in tutors if t.get("is_active_mode"))

    metrics = analytics_db.get_tutor_reliability_metrics()
    avg_ratings = [float(m.get("avg_rating") or 0) for m in metrics if m.get("avg_rating")]
    avg_rating = _avg(avg_ratings)

    kpis = KPIs(
        total_users=total_users,
        active_tutors=active_tutors,
        sessions_this_week=sessions_this_week,
        pending_requests=pending_requests,
        avg_rating=avg_rating,
    )

    # Top subjects: aggregate from all requests in the last 30 days
    start, end = _default_dates()
    requests = analytics_db.get_requests_in_range(start, end)
    subject_counter: Counter = Counter()
    for r in requests:
        for s in (r.get("subjects") or []):
            subject_counter[s] += 1
    top_subjects = [
        SubjectCount(subject=s, count=c)
        for s, c in _top_n(subject_counter, n=5)
    ]

    # Alerts
    alerts = _compute_alerts(requests, tutors)

    # Recent activity: merge sessions + complaints + registrations
    recent_sessions = analytics_db.get_recent_sessions(limit=3)
    recent_complaints = analytics_db.get_recent_complaints(limit=2)
    recent_regs = analytics_db.get_recent_registrations(limit=2)
    activity: list[ActivityItem] = []
    for s in recent_sessions:
        activity.append(ActivityItem(
            type="session",
            description=f"Session {s['status']} — {s.get('academic_level', '')}",
            created_at=str(s.get("created_at", "")),
        ))
    for c in recent_complaints:
        activity.append(ActivityItem(
            type="complaint",
            description=f"Complaint ({c.get('category', '')}) — {c.get('status', '')}",
            created_at=str(c.get("created_at", "")),
        ))
    for u in recent_regs:
        activity.append(ActivityItem(
            type="registration",
            description=f"New user registered: {u.get('full_name', '')}",
            created_at=str(u.get("created_at", "")),
        ))
    activity.sort(key=lambda x: x.created_at, reverse=True)

    return OverviewResponse(
        kpis=kpis,
        alerts=alerts,
        top_subjects=top_subjects,
        recent_activity=activity[:7],
    )


def _compute_alerts(requests: list[dict], tutors: list[dict]) -> list[str]:
    alerts: list[str] = []

    # Tutor shortage: subjects with high demand but few active tutors
    req_subjects: Counter = Counter()
    for r in requests:
        for s in (r.get("subjects") or []):
            req_subjects[s] += 1

    tutor_subjects: Counter = Counter()
    for t in tutors:
        if t.get("is_active_mode"):
            for s in (t.get("subjects") or []):
                tutor_subjects[s] += 1

    shortage_subjects = [
        s for s, cnt in req_subjects.items()
        if cnt > 0 and tutor_subjects.get(s, 0) < cnt * 0.3
    ]
    if shortage_subjects:
        top_3 = shortage_subjects[:3]
        alerts.append(
            f"Tutor shortage detected for: {', '.join(top_3)}. "
            "Consider recruiting tutors in these subjects."
        )

    # Exam urgency spike
    urgent = sum(
        1 for r in requests
        if r.get("urgency_category") in {"exam_soon", "assignment_due"}
    )
    if requests and urgent / len(requests) > 0.4:
        alerts.append(
            f"Exam urgency spike: {urgent}/{len(requests)} recent requests are urgent. "
            "Monitor tutor availability closely."
        )

    # Underserved planning areas
    req_areas: Counter = Counter()
    for r in requests:
        for a in (r.get("planning_areas") or []):
            req_areas[a] += 1
    tutor_areas: Counter = Counter()
    for t in tutors:
        if t.get("is_active_mode"):
            for a in (t.get("planning_areas") or []):
                tutor_areas[a] += 1
    underserved = [
        area for area, cnt in req_areas.items()
        if cnt >= 3 and tutor_areas.get(area, 0) == 0
    ]
    if underserved:
        alerts.append(
            f"Underserved planning areas: {', '.join(underserved[:3])}. "
            "No active tutors available in these locations."
        )

    return alerts


# ---------------------------------------------------------------------------
# UC-8.2  Demand analytics
# ---------------------------------------------------------------------------

def get_demand(start_date: str | None, end_date: str | None) -> DemandResponse:
    if not start_date or not end_date:
        start_date, end_date = _default_dates()

    requests = analytics_db.get_requests_in_range(start_date, end_date)

    subject_counter: Counter = Counter()
    topic_counter: Counter = Counter()
    area_counter: Counter = Counter()

    for r in requests:
        for s in (r.get("subjects") or []):
            subject_counter[s] += 1
        for t in (r.get("topics") or []):
            topic_counter[t] += 1
        for a in (r.get("planning_areas") or []):
            area_counter[a] += 1

    return DemandResponse(
        requests_by_subject=[SubjectCount(subject=s, count=c) for s, c in _top_n(subject_counter)],
        trending_topics=[TopicCount(topic=t, count=c) for t, c in _top_n(topic_counter)],
        by_planning_area=[AreaCount(area=a, count=c) for a, c in _top_n(area_counter)],
        total_requests=len(requests),
        start_date=start_date,
        end_date=end_date,
    )


# ---------------------------------------------------------------------------
# UC-8.3  Supply analytics
# ---------------------------------------------------------------------------

def get_supply(start_date: str | None, end_date: str | None) -> SupplyResponse:
    if not start_date or not end_date:
        start_date, end_date = _default_dates()

    tutors = analytics_db.get_all_tutor_profiles()
    total_tutors = len(tutors)
    active_tutors = sum(1 for t in tutors if t.get("is_active_mode"))

    metrics = analytics_db.get_tutor_reliability_metrics()
    metrics_map = {m["tutor_id"]: m for m in metrics}

    sessions = analytics_db.get_sessions_in_range(start_date, end_date)
    session_counts: Counter = Counter(s.get("tutor_id") for s in sessions if s.get("tutor_id"))

    avg_sessions = _avg([float(c) for c in session_counts.values()]) if session_counts else 0.0
    avg_ratings_list = [
        float(m.get("avg_rating") or 0)
        for m in metrics
        if m.get("avg_rating")
    ]
    avg_rating = _avg(avg_ratings_list)

    # Workload bands (current week)
    workload_rows = analytics_db.get_current_week_workload()
    workload_map = {w["tutor_id"]: float(w.get("confirmed_hours") or 0) for w in workload_rows}
    tutor_max = {t["user_id"]: int(t.get("max_weekly_hours") or 1) for t in tutors}

    bands = WorkloadBands(light=0, balanced=0, heavy=0)
    for t in tutors:
        if not t.get("is_active_mode"):
            continue
        tid = t["user_id"]
        confirmed = workload_map.get(tid, 0.0)
        max_h = tutor_max.get(tid, 1)
        ratio = confirmed / max_h
        if ratio < _LIGHT_LOAD:
            bands.light += 1
        elif ratio <= _HEAVY_LOAD:
            bands.balanced += 1
        else:
            bands.heavy += 1

    # Tutors by subject
    sub_counter: Counter = Counter()
    for t in tutors:
        if t.get("is_active_mode"):
            for s in (t.get("subjects") or []):
                sub_counter[s] += 1

    return SupplyResponse(
        total_tutors=total_tutors,
        active_tutors=active_tutors,
        avg_sessions_per_tutor=avg_sessions,
        avg_rating=avg_rating,
        workload_bands=bands,
        tutors_by_subject=[SubjectCount(subject=s, count=c) for s, c in _top_n(sub_counter)],
        start_date=start_date,
        end_date=end_date,
    )


# ---------------------------------------------------------------------------
# UC-8.4  Gap analysis
# ---------------------------------------------------------------------------

def get_gaps(start_date: str | None, end_date: str | None) -> GapAnalysisResponse:
    if not start_date or not end_date:
        start_date, end_date = _default_dates()

    requests = analytics_db.get_requests_in_range(start_date, end_date)
    tutors = analytics_db.get_all_tutor_profiles()

    # Demand: count requests per subject
    demand_counter: Counter = Counter()
    for r in requests:
        for s in (r.get("subjects") or []):
            demand_counter[s] += 1

    # Supply: count active tutors per subject
    supply_counter: Counter = Counter()
    for t in tutors:
        if t.get("is_active_mode"):
            for s in (t.get("subjects") or []):
                supply_counter[s] += 1

    all_subjects = set(demand_counter.keys()) | set(supply_counter.keys())
    gaps: list[GapItem] = []
    critical: list[CriticalGap] = []

    for subject in sorted(all_subjects):
        d = demand_counter.get(subject, 0)
        s = supply_counter.get(subject, 0)
        if d == 0:
            continue  # Skip subjects with no demand
        shortage = max(0, d - s)
        shortage_pct = round(shortage / d * 100, 1) if d > 0 else 0.0
        label = "balanced"
        if shortage_pct > 30:
            label = "shortage"
        elif s > d * 1.5:
            label = "surplus"

        gaps.append(GapItem(
            subject=subject,
            demand=d,
            supply=s,
            shortage_pct=shortage_pct,
            label=label,
        ))

        if shortage_pct > 30:
            critical.append(CriticalGap(
                subject=subject,
                shortfall=shortage,
                description=(
                    f"{subject}: {d} tutee request(s) but only {s} active tutor(s). "
                    f"Shortage: {shortage_pct:.0f}%."
                ),
            ))

    gaps.sort(key=lambda x: x.shortage_pct, reverse=True)

    # Textual recommendations
    recs: list[str] = []
    if critical:
        top = critical[:3]
        for c in top:
            recs.append(
                f"Recruit tutors for {c.subject} — {c.shortfall} more tutor(s) needed."
            )
    surplus_subjects = [g.subject for g in gaps if g.label == "surplus"]
    if surplus_subjects:
        recs.append(
            f"Tutors in {', '.join(surplus_subjects[:2])} exceed demand. "
            "Consider redirecting promotions to shortage subjects."
        )
    if not recs:
        recs.append("Supply and demand are broadly balanced. Continue monitoring weekly.")

    return GapAnalysisResponse(gaps=gaps, critical_gaps=critical, recommendations=recs)


# ---------------------------------------------------------------------------
# UC-8.5  Export
# ---------------------------------------------------------------------------

def export_analytics(
    start_date: str | None,
    end_date: str | None,
    fmt: str,
) -> tuple[bytes, str, str]:
    """Return (file_bytes, content_type, filename)."""
    try:
        import pandas as pd
    except ImportError:
        raise UnprocessableError("Export unavailable — pandas not installed.")

    if not start_date or not end_date:
        start_date, end_date = _default_dates()

    demand = get_demand(start_date, end_date)
    supply = get_supply(start_date, end_date)
    gaps = get_gaps(start_date, end_date)

    # Build DataFrames
    df_demand = pd.DataFrame(
        [{"subject": s.subject, "request_count": s.count} for s in demand.requests_by_subject]
    )
    df_topics = pd.DataFrame(
        [{"topic": t.topic, "count": t.count} for t in demand.trending_topics]
    )
    df_areas = pd.DataFrame(
        [{"planning_area": a.area, "request_count": a.count} for a in demand.by_planning_area]
    )
    df_supply = pd.DataFrame(
        [{"subject": s.subject, "active_tutor_count": s.count} for s in supply.tutors_by_subject]
    )
    df_gaps = pd.DataFrame(
        [
            {
                "subject": g.subject,
                "demand": g.demand,
                "supply": g.supply,
                "shortage_pct": g.shortage_pct,
                "label": g.label,
            }
            for g in gaps.gaps
        ]
    )
    df_kpis = pd.DataFrame(
        [
            {
                "metric": "Total Users",          "value": supply.total_tutors + supply.total_tutors},
            {"metric": "Active Tutors",            "value": supply.active_tutors},
            {"metric": "Avg Sessions/Tutor",       "value": supply.avg_sessions_per_tutor},
            {"metric": "Avg Tutor Rating",         "value": supply.avg_rating},
            {"metric": "Total Requests (period)",  "value": demand.total_requests},
            {"metric": "Period Start",             "value": start_date},
            {"metric": "Period End",               "value": end_date},
        ]
    )

    if fmt == "csv":
        buf = io.StringIO()
        buf.write(f"# PeerLearn Analytics Export — {start_date} to {end_date}\n\n")
        buf.write("## KPIs\n")
        df_kpis.to_csv(buf, index=False)
        buf.write("\n## Demand by Subject\n")
        df_demand.to_csv(buf, index=False)
        buf.write("\n## Trending Topics\n")
        df_topics.to_csv(buf, index=False)
        buf.write("\n## Demand by Planning Area\n")
        df_areas.to_csv(buf, index=False)
        buf.write("\n## Supply by Subject\n")
        df_supply.to_csv(buf, index=False)
        buf.write("\n## Gap Analysis\n")
        df_gaps.to_csv(buf, index=False)
        content = buf.getvalue().encode("utf-8")
        return (
            content,
            "text/csv; charset=utf-8",
            f"peerlearn_analytics_{start_date}_{end_date}.csv",
        )

    # Excel
    try:
        import openpyxl  # noqa: F401 — presence check
    except ImportError:
        raise UnprocessableError("Excel export unavailable — openpyxl not installed.")

    buf_xl = io.BytesIO()
    with pd.ExcelWriter(buf_xl, engine="openpyxl") as writer:
        df_kpis.to_excel(writer, sheet_name="KPIs", index=False)
        df_demand.to_excel(writer, sheet_name="Demand by Subject", index=False)
        df_topics.to_excel(writer, sheet_name="Trending Topics", index=False)
        df_areas.to_excel(writer, sheet_name="Demand by Area", index=False)
        df_supply.to_excel(writer, sheet_name="Supply by Subject", index=False)
        df_gaps.to_excel(writer, sheet_name="Gap Analysis", index=False)

    return (
        buf_xl.getvalue(),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        f"peerlearn_analytics_{start_date}_{end_date}.xlsx",
    )


# ---------------------------------------------------------------------------
# Weights
# ---------------------------------------------------------------------------

def get_weights() -> WeightsResponse:
    weights = get_admin_weights()
    return WeightsResponse(
        weights=weights,
        components=sorted(WEIGHT_COMPONENTS),
    )


def update_weights(body: WeightsUpdateBody) -> WeightsResponse:
    """Validate (already done by model) and persist the new weights."""
    analytics_db.save_admin_weights(body.weights)
    return get_weights()
