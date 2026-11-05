import uuid
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.app.db.session import get_db
from backend.app.db.base import get_iso_now
from backend.app.db.models import ExperimentBenchmark
from backend.app.schemas import QuotaSettingsUpdateRequest, BenchmarkRecordRequest
from backend.app.services.usage_service import usage_service
from backend.app.services.auth import require_branch_manager, require_root_admin

router = APIRouter(prefix="/api/analytics", tags=["Analytics & Feasibility"])


@router.get("/usage")
def get_usage(
    exam_id: Optional[str] = None,
    batch_id: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(require_branch_manager)
):
    return usage_service.get_usage_metrics(exam_id=exam_id, batch_id=batch_id)


@router.post("/quota")
def update_quota_settings(
    req: QuotaSettingsUpdateRequest,
    current_user: Dict[str, Any] = Depends(require_root_admin)
):
    return usage_service.update_quota_settings(req)


@router.post("/benchmark")
def record_benchmark(
    req: BenchmarkRecordRequest,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    """
    Records human teacher verification for an evaluated paper to compute
    transcription, mapping, localization, and grading agreement metrics via ORM.
    """
    bench_id = str(uuid.uuid4())
    now = get_iso_now()

    benchmark = ExperimentBenchmark(
        id=bench_id,
        exam_id=req.exam_id,
        submission_id=req.submission_id,
        ground_truth_marks=req.ground_truth_marks,
        ground_truth_answers_json=req.ground_truth_answers_json,
        transcription_accepted=1 if req.transcription_accepted else 0,
        mapping_correct=1 if req.mapping_correct else 0,
        box_accepted=1 if req.box_accepted else 0,
        marks_matched=1 if req.marks_matched else 0,
        explanation_sufficient=1 if req.explanation_sufficient else 0,
        manual_intervention_required=1 if req.manual_intervention_required else 0,
        notes=req.notes,
        created_at=now,
    )
    db.add(benchmark)
    db.commit()

    return {"id": bench_id, "message": "Benchmark record saved successfully."}


@router.get("/benchmarks/{exam_id}")
def get_exam_benchmarks(
    exam_id: str,
    current_user: Dict[str, Any] = Depends(require_branch_manager),
    db: Session = Depends(get_db)
):
    records = db.scalars(
        select(ExperimentBenchmark)
        .where(ExperimentBenchmark.exam_id == exam_id)
        .order_by(ExperimentBenchmark.created_at.desc())
    ).all()

    if not records:
        return {
            "sample_size": 0,
            "transcription_accuracy_pct": 0.0,
            "question_mapping_accuracy_pct": 0.0,
            "localization_acceptance_pct": 0.0,
            "exact_score_agreement_pct": 0.0,
            "explanation_sufficiency_pct": 0.0,
            "manual_intervention_rate_pct": 0.0,
            "records": []
        }

    total = len(records)
    transcription_acc = sum(r.transcription_accepted for r in records) / total * 100.0
    mapping_acc = sum(r.mapping_correct for r in records) / total * 100.0
    box_acc = sum(r.box_accepted for r in records) / total * 100.0
    marks_agree = sum(r.marks_matched for r in records) / total * 100.0
    exp_suff = sum(r.explanation_sufficient for r in records) / total * 100.0
    manual_interv = sum(r.manual_intervention_required for r in records) / total * 100.0

    return {
        "sample_size": total,
        "transcription_accuracy_pct": round(transcription_acc, 1),
        "question_mapping_accuracy_pct": round(mapping_acc, 1),
        "localization_acceptance_pct": round(box_acc, 1),
        "exact_score_agreement_pct": round(marks_agree, 1),
        "explanation_sufficiency_pct": round(exp_suff, 1),
        "manual_intervention_rate_pct": round(manual_interv, 1),
        "records": [
            {
                "id": r.id,
                "exam_id": r.exam_id,
                "submission_id": r.submission_id,
                "ground_truth_marks": r.ground_truth_marks,
                "transcription_accepted": r.transcription_accepted,
                "mapping_correct": r.mapping_correct,
                "box_accepted": r.box_accepted,
                "marks_matched": r.marks_matched,
                "explanation_sufficient": r.explanation_sufficient,
                "manual_intervention_required": r.manual_intervention_required,
                "notes": r.notes,
                "created_at": r.created_at,
            }
            for r in records
        ]
    }
