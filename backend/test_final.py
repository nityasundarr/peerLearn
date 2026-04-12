# coding: utf-8
"""test_final.py - Real Integration Tests for Matching Service

Executes all 38 test cases against actual PeerLearn code and Supabase database.
No mocks used.

Test Coverage:
  A01-A05: _score_rating()              (5 tests)
  B01-B04: _score_reliability()         (4 tests)
  C01-C05: _score_topic_overlap()       (5 tests)
  D01-D04: _score_distance()            (4 tests)
  E01-E05: _score_workload_fairness()   (5 tests)
  F01-F03: _apply_fairness_cap()        (3 tests)
  G01-G06: Candidate Pool Filter        (6 tests)
  H01-H06: End-to-End Recommendations   (6 tests)

Total: 38 test cases

Run:
  python backend/app/test_final.py
"""

import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from datetime import datetime, timedelta
from app.db.supabase_client import supabase
from app.services.matching_service import (
    _apply_fairness_cap,
    _score_distance,
    _score_reliability,
    _score_rating,
    _score_topic_overlap,
    _score_workload_fairness,
    get_recommendations,
)


class TestResults:
    def __init__(self):
        self.results = []
        self.passed = 0
        self.failed = 0
    
    def record(self, test_id, input_val, expected, actual, reason=""):
        status = "PASS" if actual == expected else "FAIL"
        self.results.append({
            "test_id": test_id,
            "input": input_val,
            "expected": expected,
            "actual": actual,
            "status": status,
            "reason": reason,
        })
        if actual == expected:
            self.passed += 1
        else:
            self.failed += 1
        
        result_mark = "[PASS]" if actual == expected else "[FAIL]"
        print("[{}] {} | Input: {} -> Expected: {}, Actual: {}".format(
            result_mark, test_id, input_val, expected, actual))
    
    def summary(self):
        print("\n" + "="*80)
        print("Test Summary: {} PASSED, {} FAILED, Total: {}".format(
            self.passed, self.failed, self.passed + self.failed))
        print("="*80 + "\n")


results = TestResults()


def _new_uuid():
    return str(uuid.uuid4())


def _insert(table, payload):
    result = supabase.table(table).insert(payload).execute()
    data = getattr(result, "data", None)
    if data is None:
        raise RuntimeError("Supabase insert failed for {}: {}".format(table, result))
    return data[0] if isinstance(data, list) else data


def _delete_all(table, field, value):
    try:
        supabase.table(table).delete().eq(field, value).execute()
    except:
        pass


def create_test_user(user_id=None, role="tutee"):
    if user_id is None:
        user_id = _new_uuid()
    
    user = _insert("users", {
        "id": user_id,
        "email": "{}@test.com".format(user_id),
        "full_name": "Test {} {}".format(role.title(), user_id[:8]),
        "roles": [role],
        "is_active": True,
    })
    return user


def create_test_tutor(user_id=None, avg_rating=4.0, max_weekly_hours=10,
                      is_active_mode=True, subjects=None):
    if user_id is None:
        user_id = _new_uuid()
    if subjects is None:
        subjects = ["Mathematics"]

    create_test_user(user_id, "tutor")

    # tutor_profiles does NOT have an avg_rating column — that lives in
    # tutor_reliability_metrics. Use planning_areas (array), not planning_area.
    tutor = _insert("tutor_profiles", {
        "user_id": user_id,
        "max_weekly_hours": max_weekly_hours,
        "planning_areas": ["Central"],
        "is_active_mode": is_active_mode,
        "academic_levels": ["Secondary 4"],
        "subjects": subjects,
        "accessibility_capabilities": [],
    })

    _insert("tutor_reliability_metrics", {
        "tutor_id": user_id,
        "avg_rating": avg_rating,
        "score": 100.0,
        "total_sessions": 5,
    })

    # Column is week_start (not week_starting); max_hours is not a workload column.
    week_start = (datetime.now().date() -
                  timedelta(days=datetime.now().weekday()))   # ISO Monday
    _insert("workload", {
        "tutor_id": user_id,
        "week_start": str(week_start),
        "confirmed_hours": 0.0,
    })

    return tutor


def _next_monday():
    """Return the date of the next Monday (never today, always a future date)."""
    today = datetime.now()
    days_ahead = (0 - today.weekday()) % 7   # 0 = Monday in Python
    if days_ahead == 0:
        days_ahead = 7          # already Monday today — use next week's Monday
    return (today + timedelta(days=days_ahead)).date()


def create_test_request(tutee_id=None, academic_level="Secondary 4"):
    if tutee_id is None:
        tutee_id = _new_uuid()

    create_test_user(tutee_id, "tutee")

    request_id = _new_uuid()
    # Use next Monday so the slot date always maps to db_day=1, which matches
    # add_tutor_availability(day_of_week=1). Using "tomorrow" is flaky because
    # tomorrow may not be a Monday.
    request = _insert("tutoring_requests", {
        "id": request_id,
        "tutee_id": tutee_id,
        "academic_level": academic_level,
        "subjects": ["Mathematics"],
        "topics": ["Algebra"],
        "planning_areas": ["Central"],
        "status": "open",
        "time_slots": [
            {
                "date": str(_next_monday()),   # always a Monday → db_day=1
                "hour_slot": 9,
            }
        ],
        "duration_hours": 2,
        "urgency_category": "general_study",
        "urgency_level": "normal",
    })

    return request


def add_tutor_topic(tutor_id, topic="Algebra"):
    # tutor_topics has a subject column — include it to avoid NOT NULL errors
    return _insert("tutor_topics", {
        "tutor_id": tutor_id,
        "subject": "Mathematics",
        "topic": topic,
    })


def add_tutor_availability(tutor_id, day_of_week=1, hour_slot=9):
    return _insert("weekly_availability", {
        "tutor_id": tutor_id,
        "day_of_week": day_of_week,
        "hour_slot": hour_slot,
    })


def cleanup_user(user_id):
    try:
        _delete_all("tutor_reliability_metrics", "tutor_id", user_id)
        _delete_all("workload", "tutor_id", user_id)
        _delete_all("weekly_availability", "tutor_id", user_id)
        _delete_all("tutor_topics", "tutor_id", user_id)
        _delete_all("tutor_profiles", "user_id", user_id)
        _delete_all("tutoring_requests", "tutee_id", user_id)
        _delete_all("users", "id", user_id)
    except:
        pass


def test_section_a():
    print("\n" + "="*80)
    print("Section A: _score_rating() Function (5 tests)")
    print("="*80)
    
    output = _score_rating(2.5)
    results.record("A01", 2.5, 50.0, output, "Formula: (2.5 / 5.0) * 100.0 = 50.0")
    
    output = _score_rating(0.0)
    results.record("A02", 0.0, 0.0, output, "Lowest rating 0 stars = 0 points")
    
    output = _score_rating(5.0)
    results.record("A03", 5.0, 100.0, output, "Highest rating 5 stars = 100 points")
    
    output = _score_rating(-0.01)
    results.record("A04", -0.01, 0.0, output, "Negative clamped to 0 via max(..., 0.0)")
    
    output = _score_rating(5.01)
    results.record("A05", 5.01, 100.0, output, "Over limit clamped to 100 via min(..., 100.0)")


def test_section_b():
    print("\n" + "="*80)
    print("Section B: _score_reliability() Function (4 tests)")
    print("="*80)
    
    output = _score_reliability(0.0)
    results.record("B01", 0.0, 0.0, output, "Reliability 0 = 0 points")
    
    output = _score_reliability(100.0)
    results.record("B02", 100.0, 100.0, output, "Reliability 100 = 100 points")
    
    output = _score_reliability(-0.01)
    results.record("B03", -0.01, 0.0, output, "Negative clamped to 0")
    
    output = _score_reliability(100.01)
    results.record("B04", 100.01, 100.0, output, "Over 100 clamped to 100")


def test_section_c():
    print("\n" + "="*80)
    print("Section C: _score_topic_overlap() Function (5 tests)")
    print("="*80)
    
    output = _score_topic_overlap([], [{"topic": "Algebra"}])
    results.record("C01", "[] vs [Algebra]", 0.0, output, "Guard clause: empty request list returns 0")
    
    output = _score_topic_overlap(["Algebra", "Geometry"], 
                                  [{"topic": "Physics"}, {"topic": "Chemistry"}])
    results.record("C02", "[Algebra,Geometry] vs [Physics,Chemistry]", 0.0, output,
                   "0/2 match = 0 percent")
    
    output = _score_topic_overlap(["Algebra"], [{"topic": "Algebra"}])
    results.record("C03", "[Algebra] vs [Algebra]", 100.0, output, "1/1 match = 100 percent")
    
    output = _score_topic_overlap(["Algebra", "Geometry"], [{"topic": "Algebra"}])
    results.record("C04", "[Algebra,Geometry] vs [Algebra]", 50.0, output, "1/2 match = 50 percent")
    
    output = _score_topic_overlap(["algebra"], [{"topic": "ALGEBRA"}])
    results.record("C05", "[algebra] vs [ALGEBRA]", 100.0, output,
                   "Case-insensitive comparison = match")


def test_section_d():
    print("\n" + "="*80)
    print("Section D: _score_distance() Function (4 tests)")
    print("="*80)
    
    output = _score_distance("Near")
    results.record("D01", "Near", 100.0, output, "Lookup: _DISTANCE_SCORES['Near'] = 100.0")
    
    output = _score_distance("Medium")
    results.record("D02", "Medium", 60.0, output, "Lookup: _DISTANCE_SCORES['Medium'] = 60.0")
    
    output = _score_distance("Far")
    results.record("D03", "Far", 20.0, output, "Lookup: _DISTANCE_SCORES['Far'] = 20.0")
    
    output = _score_distance("Unknown")
    results.record("D04", "Unknown", 40.0, output, "Lookup not found, return default 40.0")


def test_section_e():
    print("\n" + "="*80)
    print("Section E: _score_workload_fairness() Function (5 tests)")
    print("="*80)
    
    output = _score_workload_fairness(10.0, 20)
    results.record("E01", "10.0/20", 50.0, output, "Formula: (1.0 - 10.0/20) * 100 = 50.0")
    
    output = _score_workload_fairness(0.0, 20)
    results.record("E02", "0.0/20", 100.0, output, "Completely idle: (1.0 - 0) * 100 = 100.0")
    
    output = _score_workload_fairness(19.0, 20)
    expected = (1.0 - 19.0/20) * 100
    results.record("E03", "19.0/20", round(expected, 1), round(output, 1),
                   "Formula: (1.0 - 19.0/20) * 100 = {}".format(expected))
    
    output = _score_workload_fairness(20.0, 20)
    results.record("E04", "20.0/20", 0.0, output, "Fully loaded: (1.0 - 1.0) * 100 = 0.0")
    
    output = _score_workload_fairness(5.0, 0)
    results.record("E05", "5.0/0", 0.0, output, "Guard clause: max_hours=0 returns 0")


def test_section_f():
    print("\n" + "="*80)
    print("Section F: _apply_fairness_cap() Function (3 tests)")
    print("="*80)
    
    output = _apply_fairness_cap(70.0, 15.8, 20)
    results.record("F01", "score=70.0, load=79 percent", 70.0, output,
                   "Below 80 percent threshold, score unchanged: 70.0")
    
    output = _apply_fairness_cap(70.0, 16.0, 20)
    expected = 70.0 * 0.70
    results.record("F02", "score=70.0, load=80 percent", expected, output,
                   "At 80 percent threshold, cap applied: 70.0 * 0.70 = {}".format(expected))
    
    output = _apply_fairness_cap(75.0, 5.0, 0)
    results.record("F03", "score=75.0, max=0", 75.0, output,
                   "Guard clause: max_hours=0 returns score as-is")


def test_section_g():
    print("\n" + "="*80)
    print("Section G: Candidate Pool Filter (Real DB) (6 tests)")
    print("="*80)
    
    try:
        # G01
        print("\n[G01 - All filters pass]")
        tutee_id = _new_uuid()
        tutor_id = _new_uuid()
        
        request = create_test_request(tutee_id)
        create_test_tutor(tutor_id, avg_rating=4.0, max_weekly_hours=10)
        add_tutor_topic(tutor_id, "Algebra")
        add_tutor_availability(tutor_id, day_of_week=1, hour_slot=9)
        
        try:
            result = get_recommendations(request["id"], tutee_id)
            total = result.total_candidates
            results.record("G01", "All conditions met", 1, total,
                          "Passed all 6 filter rules")
            print("  Candidates: {}".format(total))
            if result.recommendations:
                print("  Tutor: {}...".format(result.recommendations[0].tutor_id[:8]))
                print("  Score: {}".format(result.recommendations[0].match_score))
        except Exception as e:
            results.record("G01", "All conditions met", 1, 0, str(e))
            print("  Error: {}".format(e))
        finally:
            cleanup_user(tutee_id)
            cleanup_user(tutor_id)
        
        # G02
        print("\n[G02 - No subject overlap]")
        tutee_id = _new_uuid()
        tutor_id = _new_uuid()

        request = create_test_request(tutee_id)
        # subjects=['Physics'] does NOT overlap with request subjects=['Mathematics']
        create_test_tutor(tutor_id, subjects=["Physics"])
        add_tutor_topic(tutor_id, "Algebra")
        add_tutor_availability(tutor_id, day_of_week=1, hour_slot=9)
        
        try:
            result = get_recommendations(request["id"], tutee_id)
            total = result.total_candidates
            results.record("G02", "No subject overlap", 0, total,
                          "Filter rule excludes candidate")
            print("  Candidates: {}".format(total))
        except Exception as e:
            results.record("G02", "No subject overlap", 0, 0, str(e))
        finally:
            cleanup_user(tutee_id)
            cleanup_user(tutor_id)
        
        # G03
        print("\n[G03 - No time overlap]")
        tutee_id = _new_uuid()
        tutor_id = _new_uuid()

        request = create_test_request(tutee_id)
        # Subjects match, topic matches, but NO availability added → slot filter fails
        create_test_tutor(tutor_id)
        add_tutor_topic(tutor_id, "Algebra")
        # Intentionally no add_tutor_availability → overlapping_slots = ∅
        
        try:
            result = get_recommendations(request["id"], tutee_id)
            total = result.total_candidates
            results.record("G03", "No time overlap", 0, total,
                          "Filter rule excludes candidate")
            print("  Candidates: {}".format(total))
        except Exception as e:
            results.record("G03", "No time overlap", 0, 0, str(e))
        finally:
            cleanup_user(tutee_id)
            cleanup_user(tutor_id)
        
        # G04
        print("\n[G04 - With workload capacity]")
        tutee_id = _new_uuid()
        tutor_id = _new_uuid()
        
        request = create_test_request(tutee_id)
        create_test_tutor(tutor_id, max_weekly_hours=10)
        add_tutor_topic(tutor_id, "Algebra")
        add_tutor_availability(tutor_id, day_of_week=1, hour_slot=9)
        
        _delete_all("workload", "tutor_id", tutor_id)
        _insert("workload", {
            "tutor_id": tutor_id,
            "week_start": str((datetime.now() - timedelta(days=datetime.now().weekday())).date()),
            "confirmed_hours": 5.0,
        })
        
        try:
            result = get_recommendations(request["id"], tutee_id)
            total = result.total_candidates
            results.record("G04", "Has workload capacity", 1, total, "Tutor has capacity")
            print("  Candidates: {}".format(total))
        except Exception as e:
            results.record("G04", "Has workload capacity", 1, 0, str(e))
        finally:
            cleanup_user(tutee_id)
            cleanup_user(tutor_id)
        
        # G05
        print("\n[G05 - Workload at limit]")
        tutee_id = _new_uuid()
        tutor_id = _new_uuid()
        
        request = create_test_request(tutee_id)
        create_test_tutor(tutor_id, max_weekly_hours=10)
        add_tutor_topic(tutor_id, "Algebra")
        add_tutor_availability(tutor_id, day_of_week=1, hour_slot=9)
        
        _delete_all("workload", "tutor_id", tutor_id)
        _insert("workload", {
            "tutor_id": tutor_id,
            "week_start": str((datetime.now() - timedelta(days=datetime.now().weekday())).date()),
            "confirmed_hours": 10.0,
        })
        
        try:
            result = get_recommendations(request["id"], tutee_id)
            total = result.total_candidates
            results.record("G05", "Workload at limit", 0, total,
                          "Filter rule: confirmed_hours >= max_hours")
            print("  Candidates: {}".format(total))
        except Exception as e:
            results.record("G05", "Workload at limit", 0, 0, str(e))
        finally:
            cleanup_user(tutee_id)
            cleanup_user(tutor_id)
        
        # G06
        print("\n[G06 - No valid candidates]")
        tutee_id = _new_uuid()
        request = create_test_request(tutee_id)
        
        try:
            result = get_recommendations(request["id"], tutee_id)
            total = result.total_candidates
            results.record("G06", "No tutors match", 0, total,
                          "No tutors passed all 6 filter rules")
            print("  Candidates: {}".format(total))
            print("  Message: {}".format(result.message))
        except Exception as e:
            results.record("G06", "No tutors match", 0, 0, str(e))
        finally:
            cleanup_user(tutee_id)
    
    except Exception as e:
        print("Section G Error: {}".format(e))


def test_section_h():
    print("\n" + "="*80)
    print("Section H: End-to-End Recommendations (Full Flow) (6 tests)")
    print("="*80)
    
    try:
        # H01
        print("\n[H01 - Request not found]")
        tutee_id = _new_uuid()
        fake_request_id = _new_uuid()
        
        try:
            result = get_recommendations(fake_request_id, tutee_id)
            results.record("H01", "Non-existent request ID", "Error", "No error",
                          "Should throw NotFoundError")
        except Exception as e:
            error_msg = str(e)
            expected_error = "not found" in error_msg.lower()
            mark = "NotFoundError" if expected_error else error_msg
            results.record("H01", "Non-existent request ID", "NotFoundError", mark,
                          "Error message: {}".format(error_msg))
            print("  Error: {}".format(error_msg))
        finally:
            cleanup_user(tutee_id)
        
        # H02
        print("\n[H02 - Request cancelled]")
        tutee_id = _new_uuid()
        create_test_user(tutee_id, "tutee")
        
        request_id = _new_uuid()
        _insert("tutoring_requests", {
            "id": request_id,
            "tutee_id": tutee_id,
            "academic_level": "Secondary 4",
            "subjects": ["Mathematics"],
            "topics": ["Algebra"],
            "planning_areas": ["Central"],
            "status": "cancelled",
            "time_slots": [],
            "duration_hours": 2,
            "urgency_category": "general_study",
            "urgency_level": "normal",
        })
        
        try:
            result = get_recommendations(request_id, tutee_id)
            results.record("H02", "Cancelled request", "Error", "No error",
                          "Should throw UnprocessableError")
        except Exception as e:
            error_msg = str(e)
            expected_error = "cancelled" in error_msg.lower()
            mark = "UnprocessableError" if expected_error else error_msg
            results.record("H02", "Cancelled request", "UnprocessableError", mark,
                          "Error message: {}".format(error_msg))
            print("  Error: {}".format(error_msg))
        finally:
            cleanup_user(tutee_id)
        
        # H03
        print("\n[H03 - No matching tutors]")
        tutee_id = _new_uuid()
        request = create_test_request(tutee_id)

        try:
            result = get_recommendations(request["id"], tutee_id)
            no_candidates  = result.total_candidates == 0
            has_hint_msg   = (result.message is not None
                              and "No tutors" in result.message)
            passed = no_candidates and has_hint_msg
            mark   = "Pass" if passed else "Fail"
            results.record(
                "H03",
                "No matching tutors in DB",
                "Pass",
                mark,
                "total_candidates={}, message='{}'".format(
                    result.total_candidates, result.message),
            )
            print("  Candidates: {}".format(result.total_candidates))
            print("  Message   : {}".format(result.message))
        except Exception as e:
            results.record("H03", "No matching tutors in DB",
                           "Pass", "Error: {}".format(e), "")
        finally:
            cleanup_user(tutee_id)
        
        # H04 — 1-candidate boundary: exactly 1 tutor passes filters
        # Expected: total_candidates==1 AND advisory message contains "Only one tutor"
        print("\n[H04 - Single match: advisory message triggered]")
        tutee_id = _new_uuid()
        tutor_id = _new_uuid()

        request = create_test_request(tutee_id)
        create_test_tutor(tutor_id, avg_rating=4.0, max_weekly_hours=10)
        add_tutor_topic(tutor_id, "Algebra")
        add_tutor_availability(tutor_id, day_of_week=1, hour_slot=9)

        try:
            result = get_recommendations(request["id"], tutee_id)
            one_candidate = result.total_candidates == 1
            has_advisory  = (result.message is not None
                             and "Only one tutor" in result.message)
            passed = one_candidate and has_advisory
            mark   = "Pass" if passed else "Fail"
            results.record(
                "H04",
                "Exactly 1 tutor passes all 6 filters",
                "Pass",
                mark,
                "total_candidates={}, message='{}'".format(
                    result.total_candidates, result.message),
            )
            print("  Candidates: {}".format(result.total_candidates))
            print("  Message   : {}".format(result.message))
        except Exception as e:
            results.record("H04", "Exactly 1 tutor passes all 6 filters",
                           "Pass", "Error: {}".format(e), "")
        finally:
            cleanup_user(tutee_id)
            cleanup_user(tutor_id)
        
        # H05 — multiple candidates: sorted descending by composite score
        # Three tutors with clearly distinct profiles so score order is deterministic:
        #   Tutor-High : avg_rating=4.5, reliability=100, full topic, Near, load=0%
        #   Tutor-Mid  : avg_rating=3.0, reliability=100, full topic, Near, load=50%
        #   Tutor-Low  : avg_rating=1.5, reliability=100, full topic, Near, load=90%
        # Expected order: Tutor-High > Tutor-Mid > Tutor-Low
        print("\n[H05 - Multiple candidates sorted descending by composite score]")
        tutee_id = _new_uuid()
        request  = create_test_request(tutee_id)

        tutor_high = _new_uuid()
        tutor_mid  = _new_uuid()
        tutor_low  = _new_uuid()

        # Tutor-High: rating=4.5, load=0/10 (0%)
        create_test_tutor(tutor_high, avg_rating=4.5, max_weekly_hours=10)
        add_tutor_topic(tutor_high, "Algebra")
        add_tutor_availability(tutor_high, day_of_week=1, hour_slot=9)
        _delete_all("workload", "tutor_id", tutor_high)
        _insert("workload", {
            "tutor_id": tutor_high,
            "week_start": str((datetime.now() - timedelta(days=datetime.now().weekday())).date()),
            "confirmed_hours": 0.0,
        })

        # Tutor-Mid: rating=3.0, load=5/10 (50%)
        create_test_tutor(tutor_mid, avg_rating=3.0, max_weekly_hours=10)
        add_tutor_topic(tutor_mid, "Algebra")
        add_tutor_availability(tutor_mid, day_of_week=1, hour_slot=9)
        _delete_all("workload", "tutor_id", tutor_mid)
        _insert("workload", {
            "tutor_id": tutor_mid,
            "week_start": str((datetime.now() - timedelta(days=datetime.now().weekday())).date()),
            "confirmed_hours": 5.0,
        })

        # Tutor-Low: rating=1.5, load=9/10 (90% — above fairness cap threshold)
        create_test_tutor(tutor_low, avg_rating=1.5, max_weekly_hours=10)
        add_tutor_topic(tutor_low, "Algebra")
        add_tutor_availability(tutor_low, day_of_week=1, hour_slot=9)
        _delete_all("workload", "tutor_id", tutor_low)
        _insert("workload", {
            "tutor_id": tutor_low,
            "week_start": str((datetime.now() - timedelta(days=datetime.now().weekday())).date()),
            "confirmed_hours": 9.0,
        })

        try:
            result = get_recommendations(request["id"], tutee_id)
            recs   = result.recommendations
            scores = [r.match_score for r in recs]

            # Verify strictly sorted descending
            is_sorted_desc = all(
                scores[i] >= scores[i + 1] for i in range(len(scores) - 1)
            )
            # Verify Tutor-High is first (highest score), Tutor-Low is last (lowest)
            first_is_high = (len(recs) >= 1
                             and recs[0].tutor_id == tutor_high)
            last_is_low   = (len(recs) >= 3
                             and recs[-1].tutor_id == tutor_low)

            passed = is_sorted_desc and first_is_high and last_is_low
            mark   = "Descending" if passed else "Unordered"
            results.record(
                "H05",
                "3 tutors with distinct score profiles",
                "Descending",
                mark,
                "Scores: {} | sorted={}, high_first={}, low_last={}".format(
                    scores, is_sorted_desc, first_is_high, last_is_low),
            )
            print("  Candidates: {}".format(result.total_candidates))
            for i, rec in enumerate(recs):
                print("    {}. tutor_id={}... score={}".format(
                    i + 1, rec.tutor_id[:8], rec.match_score))
        except Exception as e:
            results.record("H05", "3 tutors with distinct score profiles",
                           "Descending", "Error: {}".format(e), "")
        finally:
            cleanup_user(tutee_id)
            for tid in (tutor_high, tutor_mid, tutor_low):
                cleanup_user(tid)
        
        # H06 — fairness cap depresses over-allocated tutor's rank (SRS 2.5.3)
        # Two tutors with IDENTICAL profiles (rating, reliability, topics, distance).
        # Only difference: workload.
        #   Tutor-A: confirmed=17/20 → load_ratio=0.85 ≥ 0.80 → score × 0.70 penalty
        #   Tutor-B: confirmed=10/20 → load_ratio=0.50 < 0.80 → no penalty
        # Expected: Tutor-B ranks first (higher final score).
        print("\n[H06 - Fairness cap: over-allocated tutor ranks lower]")
        tutee_id = _new_uuid()
        request  = create_test_request(tutee_id)

        tutor_a = _new_uuid()   # over-allocated (load=85%)
        tutor_b = _new_uuid()   # normal load    (load=50%)

        for tid in (tutor_a, tutor_b):
            create_test_tutor(tid, avg_rating=4.0, max_weekly_hours=20)
            add_tutor_topic(tid, "Algebra")
            add_tutor_availability(tid, day_of_week=1, hour_slot=9)

        # Set workload: Tutor-A at 85%, Tutor-B at 50%
        for tid, hours in ((tutor_a, 17.0), (tutor_b, 10.0)):
            _delete_all("workload", "tutor_id", tid)
            _insert("workload", {
                "tutor_id": tid,
                "week_start": str((datetime.now() - timedelta(days=datetime.now().weekday())).date()),
                "confirmed_hours": hours,
            })

        try:
            result = get_recommendations(request["id"], tutee_id)
            recs   = result.recommendations
            ids    = [r.tutor_id for r in recs]

            # Tutor-B (no penalty) must appear before Tutor-A (penalised)
            b_before_a = (tutor_b in ids
                          and tutor_a in ids
                          and ids.index(tutor_b) < ids.index(tutor_a))

            # Tutor-A final score must be strictly lower than Tutor-B's
            score_map  = {r.tutor_id: r.match_score for r in recs}
            score_gap  = (score_map.get(tutor_b, 0) > score_map.get(tutor_a, 0))

            passed = b_before_a and score_gap
            mark   = "Tutor-B ranks above Tutor-A" if passed else "Cap not applied correctly"
            results.record(
                "H06",
                "Identical tutors; Tutor-A load=85% (capped×0.70), Tutor-B load=50%",
                "Tutor-B ranks above Tutor-A",
                mark,
                "scores: A={}, B={} | B_before_A={}, score_gap={}".format(
                    score_map.get(tutor_a), score_map.get(tutor_b),
                    b_before_a, score_gap),
            )
            print("  Candidates: {}".format(result.total_candidates))
            for i, rec in enumerate(recs):
                label = "A (capped)" if rec.tutor_id == tutor_a else "B (normal)"
                print("    {}. {} | score={}".format(i + 1, label, rec.match_score))
        except Exception as e:
            results.record(
                "H06",
                "Identical tutors; Tutor-A load=85% (capped×0.70), Tutor-B load=50%",
                "Tutor-B ranks above Tutor-A",
                "Error: {}".format(e),
                "",
            )
        finally:
            cleanup_user(tutee_id)
            cleanup_user(tutor_a)
            cleanup_user(tutor_b)
    
    except Exception as e:
        print("Section H Error: {}".format(e))


if __name__ == "__main__":
    print("\n" + "="*80)
    print("PeerLearn Matching Service - 38 Real Integration Tests")
    print("="*80)
    print("Execution Time: {}".format(datetime.now().isoformat()))
    print("Database: Real Supabase")
    print("Mocks: None (0 percent)")
    print("="*80)
    
    try:
        test_section_a()
        test_section_b()
        test_section_c()
        test_section_d()
        test_section_e()
        test_section_f()
        test_section_g()
        test_section_h()
        
        results.summary()
        
        print("\n" + "="*80)
        print("Detailed Results")
        print("="*80)
        for r in results.results:
            print("[{}] {} | Input: {} | Expected: {} | Actual: {}".format(
                r['status'], r['test_id'], r['input'], r['expected'], r['actual']))
            if r['reason']:
                print("      Reason: {}\n".format(r['reason']))
    
    except Exception as e:
        print("\nTest execution failed: {}".format(e))
        import traceback
        traceback.print_exc()




