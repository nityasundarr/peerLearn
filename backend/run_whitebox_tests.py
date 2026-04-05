import sys
import os

# ── Import from the REAL project file ─────────────────────────────────────
# Add backend/ to path so Python can find app.services.matching_service
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.insert(0, script_dir)

try:
    from app.services.matching_service import (
        _apply_fairness_cap,
        _score_workload_fairness,
    )
    print("✓  Imported from: app/services/matching_service.py (REAL project code)\n")
except ImportError as e:
    print(f"✗  Import failed: {e}")
    print("   Make sure you run this script from the backend/ directory:")
    print("   cd backend && python run_whitebox_tests.py\n")
    sys.exit(1)

# ── Test runner ────────────────────────────────────────────────────────────
PASS, FAIL = "PASS", "FAIL"

def run(tc_id, path, func, args, expected, note=""):
    actual     = func(*args)
    actual_r   = round(actual,   2)
    expected_r = round(expected, 2)
    status     = PASS if actual_r == expected_r else FAIL
    note_str   = f"  | {note}" if note else ""
    print(f"  {status}  {tc_id:12s}  {path:24s}  expected={expected_r:>7}  actual={actual_r:>7}{note_str}")
    return status

results = []

print("=" * 80)
print("Method 1: _apply_fairness_cap(score, confirmed_hours, max_hours)   V(G)=3")
print("=" * 80)
results.append(run("TC-AFC01", "Path 1",            _apply_fairness_cap, (80.0,  5.0,  0),  80.0, "max=0"))
results.append(run("TC-AFC02", "Path 2 (boundary)", _apply_fairness_cap, (100.0, 8.0, 10),  70.0, "load=0.80 exact threshold"))
results.append(run("TC-AFC03", "Path 2",            _apply_fairness_cap, (80.0,  9.0, 10),  56.0, "load=0.90"))
results.append(run("TC-AFC04", "Path 3 (boundary)", _apply_fairness_cap, (80.0,  7.9, 10),  80.0, "load=0.79 just below threshold"))
results.append(run("TC-AFC05", "Path 3",            _apply_fairness_cap, (60.0,  4.0, 10),  60.0, "load=0.40"))

print()
print("=" * 80)
print("Method 2: _score_workload_fairness(confirmed_hours, max_hours)   V(G)=3")
print("NOTE: load=1.0 gives result=0.0; 0.0 < 0.0 is FALSE -> Path 3, not Path 2")
print("=" * 80)
results.append(run("TC-SWF01", "Path 1",            _score_workload_fairness, (5.0,  0),   0.0, "max=0"))
results.append(run("TC-SWF02", "Path 2",            _score_workload_fairness, (12.0, 10),  0.0, "load=1.2, result=-20 clamped"))
results.append(run("TC-SWF03", "Path 3 (boundary)", _score_workload_fairness, (10.0, 10),  0.0, "load=1.0, result=0.0 NOT clamped"))
results.append(run("TC-SWF04", "Path 3 (boundary)", _score_workload_fairness, (9.9,  10),  1.0, "load=0.99, result=1.0"))
results.append(run("TC-SWF05", "Path 3",            _score_workload_fairness, (5.0,  10), 50.0, "load=0.50"))

print()
passed = results.count(PASS)
total  = len(results)
print(f"Result: {passed}/{total} tests passed")
print("All tests PASSED ✓" if passed == total else "Some tests FAILED ✗")

