"""
Metrics collection, percentile calculation (P50/P95), and reporting (CSV/JSON/Summary)
for the Playwright E2E Load Test (15-Minute 3-Phase Conduction).
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
    group_behavior: str = "A"  # 'A': Screen-on idle, 'B': View script, 'C': Browse & exit
    success: bool = False
    stage_reached: str = "INITIAL"
    login_duration_secs: Optional[float] = None
    exam_loading_duration_secs: Optional[float] = None

    # Phase 1: Pre-Exam Standby & Polling
    phase1_polls_count: int = 0
    phase1_304_count: int = 0
    phase1_200_count: int = 0
    phase1_duration_secs: Optional[float] = None

    # Phase 2: Ingestion
    pdf_generation_duration_secs: Optional[float] = None
    generated_pdf_size_bytes: Optional[int] = None
    upload_duration_secs: Optional[float] = None
    phase2_direct_cloud: bool = False
    submission_confirmed: bool = False
    submission_id: Optional[str] = None
    http_status: int = 0

    # Phase 3: Post-Upload Activity
    phase3_viewer_success: bool = False
    phase3_viewer_latency_secs: Optional[float] = None
    phase3_polls_count: int = 0
    phase3_304_count: int = 0
    phase3_duration_secs: Optional[float] = None

    # E2E Total
    total_e2e_duration_secs: Optional[float] = None

    # Forensics & Diagnostics
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

        # Phase 1 & 3 Polling Stats
        total_p1_polls = sum(s.phase1_polls_count for s in self.session_metrics)
        total_p1_304 = sum(s.phase1_304_count for s in self.session_metrics)
        total_p3_polls = sum(s.phase3_polls_count for s in self.session_metrics)
        total_p3_304 = sum(s.phase3_304_count for s in self.session_metrics)

        # Phase 2 Ingestion Stats
        direct_cloud_count = sum(1 for s in successful if s.phase2_direct_cloud)
        multipart_fallback_count = len(successful) - direct_cloud_count

        # Phase 3 Viewer Stats
        viewer_students = [s for s in successful if s.group_behavior == "B"]
        viewer_successes = [s for s in viewer_students if s.phase3_viewer_success]
        viewer_latencies = [s.phase3_viewer_latency_secs for s in viewer_successes if s.phase3_viewer_latency_secs is not None]

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
            "phase_breakdowns": {
                "phase1_pre_exam": {
                    "total_polls": total_p1_polls,
                    "http_304_count": total_p1_304,
                    "http_304_ratio": round((total_p1_304 / total_p1_polls * 100) if total_p1_polls else 0, 1),
                },
                "phase2_ingestion": {
                    "direct_cloud_uploads": direct_cloud_count,
                    "multipart_fallbacks": multipart_fallback_count,
                    "direct_cloud_percent": round((direct_cloud_count / len(successful) * 100) if successful else 0, 1),
                },
                "phase3_post_upload": {
                    "group_a_screen_on_students": len([s for s in self.session_metrics if s.group_behavior == "A"]),
                    "group_b_viewer_students": len(viewer_students),
                    "group_b_viewer_successes": len(viewer_successes),
                    "group_b_viewer_latency": compute_metric_stats(viewer_latencies),
                    "group_c_exiter_students": len([s for s in self.session_metrics if s.group_behavior == "C"]),
                    "total_steady_polls": total_p3_polls,
                    "steady_http_304_count": total_p3_304,
                }
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
        phases = summary["phase_breakdowns"]
        timings = summary["timings"]
        payloads = summary["payloads"]
        failures = summary["failures"]

        print("\n" + "=" * 95)
        print("PLAYWRIGHT MOBILE E2E LOAD TEST — 15-MINUTE 3-PHASE PERFORMANCE REPORT")
        print("=" * 95)
        print(f"Target Exam             : '{meta['exam_title']}' (ID: {meta['exam_id']})")
        print(f"Total Students Simulated: {meta['total_students']} (Cohort: TEST INSTITUTE BVI)")
        print(f"Successful Uploads      : {meta['successful_uploads']} / {meta['total_students']} ({meta['success_rate_percent']}%)")
        print(f"Failed Uploads          : {meta['failed_uploads']}")
        print(f"Total Wall Clock Time   : {meta['total_wall_clock_secs']} seconds ({meta['total_wall_clock_secs']/60:.2f} mins)")
        print("-" * 95)

        # 3-Phase Highlights
        p1 = phases["phase1_pre_exam"]
        p2 = phases["phase2_ingestion"]
        p3 = phases["phase3_post_upload"]
        print(f"[*] Phase 1 (Standby Polling) : {p1['total_polls']} polls | {p1['http_304_count']} HTTP 304 ({p1['http_304_ratio']}%)")
        print(f"[*] Phase 2 (Burst Ingestion) : Direct Cloud: {p2['direct_cloud_uploads']} | Fallback Multipart: {p2['multipart_fallbacks']} ({p2['direct_cloud_percent']}% Direct)")
        print(f"[*] Phase 3 (Post-Upload)     : Group A (Idle): {p3['group_a_screen_on_students']} | Group B (Viewer): {p3['group_b_viewer_successes']}/{p3['group_b_viewer_students']} OK | Group C (Exited): {p3['group_c_exiter_students']}")
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
        print("\n" + "=" * 115)
        print(f"{'Roll':<24} | {'Grp':<3} | {'Login':<7} | {'P1 Polls':<8} | {'Assemble':<8} | {'Upload':<8} | {'DirectCloud':<11} | {'Status'}")
        print("-" * 115)
        for s in self.session_metrics:
            login_str = f"{s.login_duration_secs:.2f}s" if s.login_duration_secs else "N/A"
            p1_str = f"{s.phase1_304_count}/{s.phase1_polls_count}"
            pdf_str = f"{s.pdf_generation_duration_secs:.2f}s" if s.pdf_generation_duration_secs else "N/A"
            up_str = f"{s.upload_duration_secs:.2f}s" if s.upload_duration_secs else "N/A"
            cloud_str = "YES (CDN)" if s.phase2_direct_cloud else "FALLBACK"
            status_str = "SUCCESS" if s.success else f"FAILED ({s.stage_reached})"
            print(f"{s.roll_number:<24} | {s.group_behavior:<3} | {login_str:<7} | {p1_str:<8} | {pdf_str:<8} | {up_str:<8} | {cloud_str:<11} | {status_str}")

        if failures:
            print("\n" + "=" * 95)
            print("FAILED SESSIONS AUDIT & FORENSICS:")
            print("=" * 95)
            for idx, f in enumerate(failures, 1):
                print(f"[{idx}] {f['roll']} ({f['name']}) -> Failed at stage: {f['stage_reached']} (HTTP: {f['http_status']})")
                print(f"    Reason     : {f['error']}")

    def export_csv(self, file_path: Path):
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "StudentIndex", "RollNumber", "StudentName", "GroupBehavior", "OffsetSecs",
                "ActualStartSecs", "Success", "StageReached", "HTTPStatus", "LoginDurationSecs",
                "Phase1Polls", "Phase1_304", "PdfGenDurationSecs", "UploadDurationSecs",
                "GeneratedPdfSizeBytes", "DirectCloud", "Phase3ViewerSuccess", "Phase3ViewerLatencySecs",
                "Phase3Polls", "Phase3_304", "TotalE2EDurationSecs", "SubmissionID", "ErrorMessage"
            ])
            for s in self.session_metrics:
                writer.writerow([
                    s.student_index, s.roll_number, s.student_name, s.group_behavior, s.scheduled_offset,
                    s.actual_start_offset, s.success, s.stage_reached, s.http_status, s.login_duration_secs,
                    s.phase1_polls_count, s.phase1_304_count, s.pdf_generation_duration_secs, s.upload_duration_secs,
                    s.generated_pdf_size_bytes, s.phase2_direct_cloud, s.phase3_viewer_success, s.phase3_viewer_latency_secs,
                    s.phase3_polls_count, s.phase3_304_count, s.total_e2e_duration_secs, s.submission_id, s.error_message
                ])

    def export_json(self, file_path: Path):
        file_path.parent.mkdir(parents=True, exist_ok=True)
        summary = self.get_summary_stats()
        summary["detailed_sessions"] = [asdict(s) for s in self.session_metrics]
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, default=str)
