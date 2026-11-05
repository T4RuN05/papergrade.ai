"""
Metrics collection, percentile calculation (P50/P95), and reporting (CSV/JSON/Summary)
for the Playwright E2E Load Test.
"""

import json
import csv
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
import math


@dataclass
class StudentSessionMetrics:
    student_index: int
    roll_number: str
    student_name: str
    scheduled_offset: float
    actual_start_offset: float
    success: bool = False
    stage_reached: str = "INITIAL"
    login_duration_secs: Optional[float] = None
    exam_loading_duration_secs: Optional[float] = None
    pdf_generation_duration_secs: Optional[float] = None
    generated_pdf_size_bytes: Optional[int] = None
    upload_duration_secs: Optional[float] = None
    total_e2e_duration_secs: Optional[float] = None
    http_status: int = 0
    submission_confirmed: bool = False
    submission_id: Optional[str] = None
    console_errors: List[str] = field(default_factory=list)
    failed_requests: List[str] = field(default_factory=list)
    error_message: Optional[str] = None
    screenshot_path: Optional[str] = None
    trace_path: Optional[str] = None

    @property
    def pdf_size_kb(self) -> Optional[float]:
        if self.generated_pdf_size_bytes is not None:
            return round(self.generated_pdf_size_bytes / 1024.0, 1)
        return None

    @property
    def pdf_size_mb(self) -> Optional[float]:
        if self.generated_pdf_size_bytes is not None:
            return round(self.generated_pdf_size_bytes / (1024.0 * 1024.0), 2)
        return None


def calculate_percentile(values: List[float], percentile: float) -> Optional[float]:
    """Calculate the p-th percentile of a list of floats (0 <= percentile <= 100)."""
    if not values:
        return None
    sorted_v = sorted(values)
    k = (len(sorted_v) - 1) * (percentile / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_v[int(k)]
    d0 = sorted_v[int(f)] * (c - k)
    d1 = sorted_v[int(c)] * (k - f)
    return d0 + d1


def compute_metric_stats(values: List[float]) -> Dict[str, Optional[float]]:
    """Compute min, max, avg, p50, and p95 for a list of numeric values."""
    if not values:
        return {"min": None, "max": None, "avg": None, "p50": None, "p95": None, "count": 0}
    return {
        "count": len(values),
        "min": round(min(values), 3),
        "max": round(max(values), 3),
        "avg": round(sum(values) / len(values), 3),
        "p50": round(calculate_percentile(values, 50) or 0.0, 3),
        "p95": round(calculate_percentile(values, 95) or 0.0, 3),
    }


class LoadTestReportAggregator:
    def __init__(self, target_exam_title: str, target_exam_id: str, total_duration_secs: int):
        self.target_exam_title = target_exam_title
        self.target_exam_id = target_exam_id
        self.total_duration_secs = total_duration_secs
        self.start_timestamp = datetime.now()
        self.end_timestamp: Optional[datetime] = None
        self.session_metrics: List[StudentSessionMetrics] = []
        self.telemetry_data: Dict[str, Any] = {}

    def add_result(self, result: StudentSessionMetrics):
        self.session_metrics.append(result)

    def set_telemetry(self, telemetry: Dict[str, Any]):
        self.telemetry_data = telemetry

    def finalize(self):
        self.end_timestamp = datetime.now()
        self.session_metrics.sort(key=lambda s: s.student_index)

    @property
    def elapsed_wall_clock_secs(self) -> float:
        if self.end_timestamp:
            return (self.end_timestamp - self.start_timestamp).total_seconds()
        return (datetime.now() - self.start_timestamp).total_seconds()

    def get_summary_stats(self) -> Dict[str, Any]:
        successful = [s for s in self.session_metrics if s.success]
        failed = [s for s in self.session_metrics if not s.success]

        login_durations = [s.login_duration_secs for s in successful if s.login_duration_secs is not None]
        exam_loading_durations = [s.exam_loading_duration_secs for s in successful if s.exam_loading_duration_secs is not None]
        pdf_gen_durations = [s.pdf_generation_duration_secs for s in successful if s.pdf_generation_duration_secs is not None]
        upload_durations = [s.upload_duration_secs for s in successful if s.upload_duration_secs is not None]
        total_e2e_durations = [s.total_e2e_duration_secs for s in successful if s.total_e2e_duration_secs is not None]
        pdf_sizes_kb = [s.pdf_size_kb for s in successful if s.pdf_size_kb is not None]

        return {
            "test_metadata": {
                "exam_title": self.target_exam_title,
                "exam_id": self.target_exam_id,
                "start_time": self.start_timestamp.isoformat(),
                "end_time": self.end_timestamp.isoformat() if self.end_timestamp else None,
                "total_wall_clock_secs": round(self.elapsed_wall_clock_secs, 2),
                "total_students": len(self.session_metrics),
                "successful_uploads": len(successful),
                "failed_uploads": len(failed),
                "success_rate_percent": round((len(successful) / len(self.session_metrics) * 100) if self.session_metrics else 0, 1),
            },
            "timings": {
                "login_duration_secs": compute_metric_stats(login_durations),
                "exam_loading_duration_secs": compute_metric_stats(exam_loading_durations),
                "pdf_generation_duration_secs": compute_metric_stats(pdf_gen_durations),
                "upload_duration_secs": compute_metric_stats(upload_durations),
                "total_e2e_duration_secs": compute_metric_stats(total_e2e_durations),
            },
            "payloads": {
                "pdf_size_kb": compute_metric_stats(pdf_sizes_kb),
            },
            "failures": [
                {
                    "roll": f.roll_number,
                    "name": f.student_name,
                    "stage_reached": f.stage_reached,
                    "http_status": f.http_status,
                    "error": f.error_message,
                    "screenshot": f.screenshot_path,
                    "trace": f.trace_path,
                }
                for f in failed
            ],
            "server_telemetry": self.telemetry_data
        }

    def print_summary_report(self):
        summary = self.get_summary_stats()
        meta = summary["test_metadata"]
        timings = summary["timings"]
        payloads = summary["payloads"]
        failures = summary["failures"]

        print("\n" + "=" * 95)
        print("PLAYWRIGHT MOBILE E2E LOAD TEST — COMPREHENSIVE PERFORMANCE REPORT")
        print("=" * 95)
        print(f"Target Exam             : '{meta['exam_title']}' (ID: {meta['exam_id']})")
        print(f"Total Students Simulated: {meta['total_students']}")
        print(f"Successful Uploads      : {meta['successful_uploads']} / {meta['total_students']} ({meta['success_rate_percent']}%)")
        print(f"Failed Uploads          : {meta['failed_uploads']}")
        print(f"Total Wall Clock Time   : {meta['total_wall_clock_secs']} seconds ({meta['total_wall_clock_secs']/60:.2f} mins)")
        print("-" * 95)

        # Tabular timing percentiles
        print(f"{'Metric Name':<28} | {'Min (s)':<9} | {'Avg (s)':<9} | {'Median (P50)':<13} | {'P95 (s)':<9} | {'Max (s)':<9}")
        print("-" * 95)
        for name, key in [
            ("Login Duration", "login_duration_secs"),
            ("Exam Load Duration", "exam_loading_duration_secs"),
            ("Client PDF Assembly", "pdf_generation_duration_secs"),
            ("Upload Round-Trip", "upload_duration_secs"),
            ("Total Per-Student E2E", "total_e2e_duration_secs"),
        ]:
            s = timings[key]
            if s["count"] > 0:
                print(f"{name:<28} | {s['min']:<9.2f} | {s['avg']:<9.2f} | {s['p50']:<13.2f} | {s['p95']:<9.2f} | {s['max']:<9.2f}")
            else:
                print(f"{name:<28} | {'N/A':<9} | {'N/A':<9} | {'N/A':<13} | {'N/A':<9} | {'N/A':<9}")

        # PDF payload size
        pdf_s = payloads["pdf_size_kb"]
        if pdf_s["count"] > 0:
            print("-" * 95)
            print(f"Generated PDF Size (KB)      | Min: {pdf_s['min']:.1f} KB | Avg: {pdf_s['avg']:.1f} KB | P50: {pdf_s['p50']:.1f} KB | P95: {pdf_s['p95']:.1f} KB | Max: {pdf_s['max']:.1f} KB")

        # Telemetry Block
        if self.telemetry_data:
            print("-" * 95)
            print("BACKEND INFRASTRUCTURE TELEMETRY:")
            for k, v in self.telemetry_data.items():
                print(f"  - {k}: {v}")

        # Detailed per-student breakdown table
        print("\n" + "=" * 105)
        print(f"{'Roll':<12} | {'Student Name':<18} | {'Login':<7} | {'ExamLoad':<9} | {'Assemble':<9} | {'Upload':<8} | {'PDF Size':<9} | {'Status'}")
        print("-" * 105)
        for s in self.session_metrics:
            login_str = f"{s.login_duration_secs:.2f}s" if s.login_duration_secs else "N/A"
            exam_str = f"{s.exam_loading_duration_secs:.2f}s" if s.exam_loading_duration_secs else "N/A"
            pdf_str = f"{s.pdf_generation_duration_secs:.2f}s" if s.pdf_generation_duration_secs else "N/A"
            up_str = f"{s.upload_duration_secs:.2f}s" if s.upload_duration_secs else "N/A"
            size_str = f"{s.pdf_size_kb:.0f} KB" if s.pdf_size_kb else "N/A"
            status_str = "SUCCESS" if s.success else f"FAILED ({s.stage_reached})"
            print(f"{s.roll_number:<12} | {s.student_name:<18} | {login_str:<7} | {exam_str:<9} | {pdf_str:<9} | {up_str:<8} | {size_str:<9} | {status_str}")

        if failures:
            print("\n" + "=" * 95)
            print("FAILED SESSIONS AUDIT & FORENSICS:")
            print("=" * 95)
            for idx, f in enumerate(failures, 1):
                print(f"[{idx}] {f['roll']} ({f['name']}) -> Failed at stage: {f['stage_reached']} (HTTP: {f['http_status']})")
                print(f"    Reason     : {f['error']}")
                if f['screenshot']:
                    print(f"    Screenshot : {f['screenshot']}")
                if f['trace']:
                    print(f"    Trace      : {f['trace']}")
            print("=" * 95)

    def export_csv(self, filepath: Path):
        """Export per-student session metrics to CSV."""
        filepath.parent.mkdir(parents=True, exist_ok=True)
        fieldnames = [
            "student_index", "roll_number", "student_name", "scheduled_offset",
            "actual_start_offset", "success", "stage_reached", "login_duration_secs",
            "exam_loading_duration_secs", "pdf_generation_duration_secs",
            "upload_duration_secs", "total_e2e_duration_secs",
            "generated_pdf_size_bytes", "pdf_size_kb", "http_status",
            "submission_confirmed", "submission_id", "error_message",
            "console_errors_count", "failed_requests_count",
            "screenshot_path", "trace_path"
        ]

        with open(filepath, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for s in self.session_metrics:
                row = asdict(s)
                row["pdf_size_kb"] = s.pdf_size_kb
                row["console_errors_count"] = len(s.console_errors)
                row["failed_requests_count"] = len(s.failed_requests)
                del row["console_errors"]
                del row["failed_requests"]
                writer.writerow(row)

    def export_json(self, filepath: Path):
        """Export comprehensive load test report including metadata and telemetry to JSON."""
        filepath.parent.mkdir(parents=True, exist_ok=True)
        report_data = {
            "summary": self.get_summary_stats(),
            "students": [asdict(s) for s in self.session_metrics]
        }
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2, default=str)

