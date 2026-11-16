"""
Dispatch scheduler for simulating concurrent student arrivals over a 10-15 minute exam lifecycle.
Assigns realistic multi-phase behaviors (Group A: screen-on idle, Group B: script inspection, Group C: browse & exit).
"""

import random
from dataclasses import dataclass
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from .config import (
    DEFAULT_STUDENTS,
    DEFAULT_SAMPLE_PAGES_DIR,
    DEFAULT_PAGES_PER_STUDENT,
    TOTAL_STUDENTS,
    TOTAL_DURATION_SECONDS,
    PHASE1_PRE_EXAM_WAIT_SECS,
    PHASE2_INGESTION_SPAN_SECS,
    PHASE3_POST_UPLOAD_SECS,
    RANDOM_SEED
)


@dataclass
class ScheduledStudentTask:
    student_index: int
    roll_number: str
    student_name: str
    email: str
    password: str
    sample_images: List[Path]
    offset_seconds: float
    group_behavior: str = "A"  # 'A': Screen-on idle, 'B': View script, 'C': Browse & exit
    phase1_wait_secs: float = 0.0
    post_upload_stay_secs: float = 60.0
    target_start_time: Optional[datetime] = None

    @property
    def formatted_offset(self) -> str:
        mins = int(self.offset_seconds // 60)
        secs = int(self.offset_seconds % 60)
        return f"T+{mins:02d}m {secs:02d}s ({self.offset_seconds:5.1f}s)"

    @property
    def behavior_description(self) -> str:
        if self.group_behavior == "A":
            return "Screen-ON Watcher (Continuous Polling)"
        elif self.group_behavior == "B":
            return "Script Inspector (Canvas PDF.js View)"
        return "Navigator / Exiter (Browse & Close)"


def get_sample_page_images(
    sample_dir: Path = DEFAULT_SAMPLE_PAGES_DIR,
    pages_per_student: int = DEFAULT_PAGES_PER_STUDENT
) -> List[Path]:
    """Find and return high-quality sample answer sheet page images."""
    if not sample_dir.exists():
        raise FileNotFoundError(f"Sample pages directory not found: {sample_dir}")

    # Gather page renders (e.g. page_1.png, page_2.png...)
    all_imgs = sorted(
        list(sample_dir.glob("page_*.png")),
        key=lambda p: int(p.stem.split("_")[1]) if p.stem.split("_")[1].isdigit() else p.name
    )

    if not all_imgs:
        all_imgs = sorted(list(sample_dir.glob("*.png")) + list(sample_dir.glob("*.jpg")))

    if not all_imgs:
        raise FileNotFoundError(f"No answer sheet images found in {sample_dir}")

    return all_imgs[:min(pages_per_student, len(all_imgs))]


def build_dispatch_schedule(
    students: List[Dict[str, str]] = DEFAULT_STUDENTS,
    sample_dir: Path = DEFAULT_SAMPLE_PAGES_DIR,
    pages_per_student: int = DEFAULT_PAGES_PER_STUDENT,
    total_duration_secs: int = TOTAL_DURATION_SECONDS,
    burst: bool = False,
    simulate_pre_exam: bool = True,
    seed: int = RANDOM_SEED
) -> List[ScheduledStudentTask]:
    """
    Build a realistic 3-phase scheduled dispatch plan:
    - Phase 1: Pre-exam standby (0 to 180s)
    - Phase 2: Ingestion window (staggered or burst)
    - Phase 3: Post-upload behavioral split:
        - Students 1 to 10: Group A (screen on, idle polling)
        - Students 11 to 20: Group B (view submitted script)
        - Students 21 to 28: Group C (browse and close browser)
    """
    sample_images = get_sample_page_images(sample_dir, pages_per_student)
    num_students = len(students)
    rng = random.Random(seed)

    if burst:
        offsets = [0.0] * num_students
    else:
        # Front-heavy Beta curve for upload initiation within ingestion window
        ingestion_span = min(PHASE2_INGESTION_SPAN_SECS, total_duration_secs)
        max_active_span = max(10, ingestion_span - 20)
        raw_offsets = [
            round(rng.betavariate(1.6, 3.6) * max_active_span + 2.0, 1)
            for _ in range(num_students)
        ]
        raw_offsets.sort()
        offsets = raw_offsets

    tasks: List[ScheduledStudentTask] = []
    for idx, (student, offset) in enumerate(zip(students, offsets), 1):
        # Assign behavioral group: 1-10 -> A, 11-20 -> B, 21-28 -> C
        if idx <= 10:
            group = "A"
            stay_secs = round(rng.uniform(180.0, 360.0), 1)
        elif idx <= 20:
            group = "B"
            stay_secs = round(rng.uniform(90.0, 180.0), 1)
        else:
            group = "C"
            stay_secs = round(rng.uniform(30.0, 90.0), 1)

        p1_wait = round(rng.uniform(10.0, 30.0), 1) if simulate_pre_exam else 0.0

        task = ScheduledStudentTask(
            student_index=idx,
            roll_number=student["roll"],
            student_name=student["name"],
            email=student["email"],
            password=student.get("password", "Student@123"),
            sample_images=sample_images,
            offset_seconds=offset,
            group_behavior=group,
            phase1_wait_secs=p1_wait,
            post_upload_stay_secs=stay_secs
        )
        tasks.append(task)

    tasks.sort(key=lambda t: t.offset_seconds)
    return tasks


def print_dispatch_schedule_table(tasks: List[ScheduledStudentTask], total_duration_secs: int):
    """Prints a clear tabular preview of the scheduled student dispatch."""
    group_a = [t for t in tasks if t.group_behavior == "A"]
    group_b = [t for t in tasks if t.group_behavior == "B"]
    group_c = [t for t in tasks if t.group_behavior == "C"]

    print("\n" + "=" * 105)
    print("PLAYWRIGHT LOAD TEST - 15-MINUTE 3-PHASE DISPATCH PLAN (TEST INSTITUTE BVI)")
    print("=" * 105)
    print(f"Total Cohort Size   : {len(tasks)} students (TEST_INST-TEST_BVI-001 to 028)")
    print(f"Total Test Duration : {total_duration_secs}s ({total_duration_secs/60:.1f} minutes)")
    print(f"Group A (Screen ON) : {len(group_a)} students — Continuous polling until session close")
    print(f"Group B (Inspectors): {len(group_b)} students — Open /student/submissions/[id] canvas viewer")
    print(f"Group C (Browsers)  : {len(group_c)} students — Browse past exams and exit after 30-90s")
    print("-" * 105)
    print(f"{'#':<3} | {'Scheduled Offset':<20} | {'Roll Number':<24} | {'Grp':<3} | {'Post-Upload Activity':<34}")
    print("-" * 105)
    for idx, task in enumerate(tasks, 1):
        print(f"{idx:<3} | {task.formatted_offset:<20} | {task.roll_number:<24} | {task.group_behavior:<3} | {task.behavior_description:<34}")
    print("-" * 105 + "\n")
