"""
Dispatch scheduler for simulating concurrent student arrivals over a 5-minute window.
Generates front-heavy arrival distributions (Beta distribution) simulating realistic exam submission rushes.
"""

import random
from dataclasses import dataclass
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from .config import (
    C25_BORIVALI_STUDENTS,
    DEFAULT_SAMPLE_PAGES_DIR,
    DEFAULT_PAGES_PER_STUDENT,
    TOTAL_STUDENTS,
    TOTAL_DURATION_SECONDS,
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
    target_start_time: Optional[datetime] = None

    @property
    def formatted_offset(self) -> str:
        mins = int(self.offset_seconds // 60)
        secs = int(self.offset_seconds % 60)
        return f"T+{mins:02d}m {secs:02d}s ({self.offset_seconds:5.1f}s)"


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
        # Fallback to any PNG or JPG in that folder
        all_imgs = sorted(list(sample_dir.glob("*.png")) + list(sample_dir.glob("*.jpg")))

    if not all_imgs:
        raise FileNotFoundError(f"No answer sheet images found in {sample_dir}")

    # Return top N pages (default 4-5 pages)
    return all_imgs[:min(pages_per_student, len(all_imgs))]


def build_dispatch_schedule(
    students: List[Dict[str, str]] = C25_BORIVALI_STUDENTS,
    sample_dir: Path = DEFAULT_SAMPLE_PAGES_DIR,
    pages_per_student: int = DEFAULT_PAGES_PER_STUDENT,
    total_duration_secs: int = TOTAL_DURATION_SECONDS,
    burst: bool = False,
    seed: int = RANDOM_SEED
) -> List[ScheduledStudentTask]:
    """
    Build a scheduled dispatch plan for students.
    If burst is False, uses a front-heavy Beta distribution (alpha=1.6, beta=3.6)
    concentrating ~75-80% of student submissions in the first half (0 to 150s),
    tapering down smoothly across the remaining duration.
    """
    sample_images = get_sample_page_images(sample_dir, pages_per_student)
    num_students = len(students)

    if burst:
        offsets = [0.0] * num_students
    else:
        rng = random.Random(seed)
        # Scaled Beta distribution with safety buffer of 20 seconds before window end
        max_active_span = max(10, total_duration_secs - 20)
        raw_offsets = [
            round(rng.betavariate(1.6, 3.6) * max_active_span + 5.0, 1)
            for _ in range(num_students)
        ]
        raw_offsets.sort()
        offsets = raw_offsets

    tasks: List[ScheduledStudentTask] = []
    for idx, (student, offset) in enumerate(zip(students, offsets), 1):
        task = ScheduledStudentTask(
            student_index=idx,
            roll_number=student["roll"],
            student_name=student["name"],
            email=student["email"],
            password=student.get("password", "Student@123"),
            sample_images=sample_images,
            offset_seconds=offset
        )
        tasks.append(task)

    # Sorted by arrival offset
    tasks.sort(key=lambda t: t.offset_seconds)
    return tasks


def print_dispatch_schedule_table(tasks: List[ScheduledStudentTask], total_duration_secs: int):
    """Prints a clear tabular preview of the scheduled student dispatch."""
    half_time = total_duration_secs / 2.0
    first_half = [t for t in tasks if t.offset_seconds <= half_time]
    second_half = [t for t in tasks if t.offset_seconds > half_time]

    print("\n" + "=" * 90)
    print("PLAYWRIGHT LOAD TEST - SCHEDULED DISPATCH PLAN")
    print("=" * 90)
    print(f"Total Students      : {len(tasks)}")
    print(f"Window Duration     : {total_duration_secs}s ({total_duration_secs/60:.1f} minutes)")
    print(f"First Half Arrivals : {len(first_half)} / {len(tasks)} ({len(first_half)/len(tasks)*100:.1f}%) [<= {half_time:.0f}s]")
    print(f"Second Half Arrivals: {len(second_half)} / {len(tasks)} ({len(second_half)/len(tasks)*100:.1f}%) [> {half_time:.0f}s]")
    print("-" * 90)
    print(f"{'#':<3} | {'Scheduled Dispatch':<22} | {'Roll Number':<12} | {'Student Name':<20} | {'Pages'}")
    print("-" * 90)
    for idx, task in enumerate(tasks, 1):
        print(f"{idx:<3} | {task.formatted_offset:<22} | {task.roll_number:<12} | {task.student_name:<20} | {len(task.sample_images)} pages")
    print("-" * 90 + "\n")

