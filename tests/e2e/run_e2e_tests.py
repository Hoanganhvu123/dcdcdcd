#!/usr/bin/env python
"""
DB-GPT Full-Stack Overhaul — Standalone E2E Test Suite Runner

Usage:
  python run_e2e_tests.py [--tier {1,2,3,4,all}] [--verbose] [--json] [--filter KEYWORD]
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="DB-GPT Full-Stack E2E Test Suite Runner")
    parser.add_argument(
        "--tier",
        choices=["1", "2", "3", "4", "all"],
        default="all",
        help="Test tier to execute: 1 (Feature Coverage), 2 (Boundary/Edge Cases), 3 (Cross-Feature), 4 (Real-World Scenarios), or all (default: all)"
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose test output")
    parser.add_argument("--json", action="store_true", help="Output summary report as JSON")
    parser.add_argument("-k", "--filter", default=None, help="Filter tests by keyword expression")
    args = parser.parse_args()

    # Determine test directory and target files
    current_dir = Path(__file__).resolve().parent
    tier_map = {
        "1": ["test_tier1_feature_coverage.py"],
        "2": ["test_tier2_boundary_corner.py"],
        "3": ["test_tier3_cross_feature.py"],
        "4": ["test_tier4_real_world_scenarios.py"],
        "all": [
            "test_tier1_feature_coverage.py",
            "test_tier2_boundary_corner.py",
            "test_tier3_cross_feature.py",
            "test_tier4_real_world_scenarios.py"
        ]
    }

    target_files = [str(current_dir / f) for f in tier_map[args.tier]]

    # Banner
    if not args.json:
        print("=" * 80)
        print("  DB-GPT FULL-STACK OVERHAUL — 4-TIER E2E TEST RUNNER")
        print(f"  Target Tier : {args.tier.upper()}")
        print(f"  Directory   : {current_dir}")
        print("=" * 80)

    start_time = time.time()

    try:
        import pytest
    except ImportError:
        print("Error: pytest is required to run the E2E test suite.", file=sys.stderr)
        sys.exit(2)

    pytest_args = []
    if args.verbose:
        pytest_args.append("-v")
    else:
        pytest_args.append("-q")

    if args.filter:
        pytest_args.extend(["-k", args.filter])

    pytest_args.extend(target_files)

    # Run pytest
    exit_code = pytest.main(pytest_args)
    duration = time.time() - start_time

    if args.json:
        report = {
            "status": "PASSED" if exit_code == 0 else "FAILED",
            "exit_code": int(exit_code),
            "tier": args.tier,
            "duration_sec": round(duration, 3),
            "target_files": target_files
        }
        print(json.dumps(report, indent=2))
    else:
        print("-" * 80)
        status_text = "\033[92mPASSED\033[0m" if exit_code == 0 else "\033[91mFAILED\033[0m"
        print(f"  E2E Test Result : {status_text}")
        print(f"  Duration        : {duration:.2f}s")
        print(f"  Exit Code       : {exit_code}")
        print("=" * 80)

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
