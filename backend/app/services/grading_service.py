import uuid
import json
import re
import shutil
import threading
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import select, delete, update, or_

from backend.app.config import settings
from backend.app.db.session import get_session
from backend.app.db.base import get_iso_now
from backend.app.db.models import (
    Submission,
    Answer,
    AnswerRegion,
    CriterionScore,
    RubricVersion,
    AuditLog,
    RevaluationRequest,
    Exam,
)
from backend.app.schemas import (
    StudentGradingExtractionResult,
    GradedAnswerItem,
    ManualEditAnswerRequest,
    ManualEditRegionRequest
)
from backend.app.services.pdf_service import pdf_service
from backend.app.services.retention_service import RetentionService
from backend.app.services.storage import get_storage_service


def _enforce_evidence_grounding_and_verdict(
    awarded_marks: float,
    max_marks: float,
    evidence: str,
    extracted_student_answer: str,
) -> float:
    """
    Deterministic kill-switch:
    1. Forces 0.0 marks if evidence does not start with 'PASS' or contains failure markers.
    2. Forces 0.0 marks if the quoted text is missing or fabricated (not in extracted_student_answer).
    3. Rounds valid marks to nearest 0.5 step within [0.0, max_marks].
    """
    ev = (evidence or "").strip()
    ev_upper = ev.upper()

    # Rule 1: Explicit FAIL / MISSING / NOT FOUND check
    if (
        not ev_upper.startswith("PASS")
        or ev_upper.startswith("FAIL")
        or ev_upper.startswith("MISSING")
        or "FAILED:" in ev_upper
        or "NOT FOUND" in ev_upper
    ):
        return 0.0

    # Rule 2: Verify QUOTE substring exists in extracted_student_answer
    quote_match = re.search(r'QUOTE:\s*["\']([^"\']*)["\']', ev, flags=re.IGNORECASE)
    if quote_match:
        raw_quote = quote_match.group(1).strip()
        norm_quote = " ".join(raw_quote.lower().split())
        norm_transcript = " ".join((extracted_student_answer or "").lower().split())

        if norm_quote in {"", "none", "missing", "n/a", "null"}:
            return 0.0

        # Allow visual diagram evidence verified from attached crop or [DIAGRAM: ...] tags
        is_visual_or_diagram = (
            norm_quote.startswith("[diagram")
            or norm_quote.startswith("visual:")
            or norm_quote.startswith("[visual")
            or "[diagram" in norm_transcript
        )
        if not is_visual_or_diagram:
            # If quote is > 6 chars and not a literal substring of the transcript, check alphanumeric & segment matches
            if len(norm_quote) > 6 and norm_quote not in norm_transcript:
                clean_t = re.sub(r'[^a-z0-9]', '', norm_transcript)
                clean_quote_str = norm_quote
                for lt in [r'\implies', r'\therefore', r'\times', r'\cdot', r'\neq', r'\approx', r'\pm', r'\left', r'\right']:
                    clean_quote_str = clean_quote_str.replace(lt, ' ')

                clean_q = re.sub(r'[^a-z0-9]', '', clean_quote_str.replace(r'\rightarrow', ' ').replace('->', ' '))
                if not clean_t:
                    return 0.0

                # Check 1: direct alphanumeric match
                is_grounded = bool(clean_q and clean_q in clean_t)

                # Check 2: segmented / ellipsis / arrow-separated quote matching
                if not is_grounded:
                    segments = [s.strip() for s in re.split(r'\\\.{3,}|\u2026|\||\\rightarrow|->', clean_quote_str) if s.strip()]
                    if len(segments) > 1:
                        valid_segs = 0
                        matched_segs = 0
                        for seg in segments:
                            clean_seg = re.sub(r'[^a-z0-9]', '', seg)
                            if len(clean_seg) >= 3:
                                valid_segs += 1
                                if clean_seg in clean_t:
                                    matched_segs += 1
                                else:
                                    words = seg.split()
                                    if len(words) >= 3:
                                        sub_clean = re.sub(r'[^a-z0-9]', '', ' '.join(words[:4]))
                                        if sub_clean and sub_clean in clean_t:
                                            matched_segs += 1
                        if valid_segs > 0 and (matched_segs == valid_segs or (valid_segs >= 3 and matched_segs >= valid_segs - 1)):
                            is_grounded = True

                # Check 3: anchor prefix (at least 4 consecutive words from start of quote)
                if not is_grounded:
                    words = clean_quote_str.split()
                    if len(words) >= 4:
                        head_clean = re.sub(r'[^a-z0-9]', '', ' '.join(words[:4]))
                        if len(head_clean) >= 10 and head_clean in clean_t:
                            is_grounded = True

                if not is_grounded:
                    return 0.0

    # Rule 3: Clamp to [0.0, max_marks] and snap to discrete 0.5 increments
    clamped = max(0.0, min(float(awarded_marks), float(max_marks)))
    return round(clamped * 2.0) / 2.0


class GradingService:
    _enforce_evidence_grounding_and_verdict = staticmethod(_enforce_evidence_grounding_and_verdict)

    @staticmethod
    def apply_best_of_n_and_compute_totals(
        cursor,
        submission_id: str,
        rubric_data: Dict[str, Any],
        now: str
    ) -> Tuple[float, float, float, bool]:
        """
        Enforces Section Attempt Limits ("Attempt any X out of Y") and Best-of-N logic.
        If a student attempted more than X questions in a section, the top X highest
        scoring answers are counted toward the total; the lower scoring excess answers
        are marked with is_extra_attempt = 1 (and 0 marks counted in total).
        Supports both SQLAlchemy Session and legacy DBAPI cursor.
        """
        sections = rubric_data.get("sections", [])
        exam_max_marks = float(rubric_data.get("total_marks") or 0.0)

        if isinstance(cursor, Session):
            ans_objs = cursor.scalars(
                select(Answer).where(Answer.submission_id == submission_id)
            ).all()
            all_answers = [
                {
                    "id": a.id,
                    "question_id": a.question_id,
                    "subquestion_id": a.subquestion_id,
                    "section_id": a.section_id,
                    "awarded_marks": a.awarded_marks,
                    "max_marks": a.max_marks,
                    "is_missing": a.is_missing,
                    "needs_review": a.needs_review,
                    "is_extra_attempt": a.is_extra_attempt,
                }
                for a in ans_objs
            ]
        else:
            cursor.execute("""
            SELECT id, question_id, subquestion_id, section_id, awarded_marks, max_marks, is_missing, needs_review, is_extra_attempt
            FROM answers
            WHERE submission_id = ?
            """, (submission_id,))
            all_answers = [dict(r) for r in cursor.fetchall()]

        # Build map of question -> section
        q_to_section = {}
        section_meta = {}
        for sec in sections:
            s_id = sec.get("section_id")
            section_meta[s_id] = sec
            for qid in sec.get("question_ids", []):
                q_to_section[qid] = s_id

        for rq in rubric_data.get("questions", []):
            if rq.get("section_id"):
                q_to_section[rq["question_id"]] = rq["section_id"]

        # Group answers by section
        sec_answers: Dict[str, List[Dict[str, Any]]] = {}
        unsectioned_answers: List[Dict[str, Any]] = []

        for a in all_answers:
            s_id = a.get("section_id") or q_to_section.get(a["question_id"])
            if s_id and s_id in section_meta:
                sec_answers.setdefault(s_id, []).append(a)
            else:
                unsectioned_answers.append(a)

        tot_awarded = 0.0
        calculated_exam_max = 0.0
        overall_needs_review = any(bool(a.get("needs_review")) for a in all_answers)
        new_extra_ids = set()

        # Process each section with Best-of-N
        for s_id, s_conf in section_meta.items():
            ans_list = sec_answers.get(s_id, [])
            attempt_limit = s_conf.get("attempt_limit")
            sec_max = float(s_conf.get("max_marks") or 0.0)
            calculated_exam_max += sec_max

            if attempt_limit and attempt_limit > 0 and len(ans_list) > 0:
                attempted = [a for a in ans_list if not a.get("is_missing") and float(a.get("awarded_marks") or 0.0) > 0]
                unattempted = [a for a in ans_list if a not in attempted]

                # Sort attempted answers by awarded_marks descending (Best of N)
                attempted.sort(key=lambda x: float(x.get("awarded_marks") or 0.0), reverse=True)

                counted_answers = attempted[:attempt_limit]
                extra_answers = attempted[attempt_limit:]

                slots_left = attempt_limit - len(counted_answers)
                if slots_left > 0 and unattempted:
                    counted_answers.extend(unattempted[:slots_left])
                    extra_answers.extend(unattempted[slots_left:])

                for extra in extra_answers:
                    new_extra_ids.add(extra["id"])

                sec_awarded = sum(float(a.get("awarded_marks") or 0.0) for a in counted_answers)
                if sec_max > 0:
                    sec_awarded = min(sec_awarded, sec_max)
                tot_awarded += sec_awarded
            else:
                sec_awarded = sum(float(a.get("awarded_marks") or 0.0) for a in ans_list)
                if sec_max > 0:
                    sec_awarded = min(sec_awarded, sec_max)
                tot_awarded += sec_awarded

        # Add unsectioned compulsory questions
        for a in unsectioned_answers:
            tot_awarded += float(a.get("awarded_marks") or 0.0)
            calculated_exam_max += float(a.get("max_marks") or 0.0)

        # Determine final total max marks
        final_max_marks = exam_max_marks if exam_max_marks > 0 else (calculated_exam_max if calculated_exam_max > 0 else 1.0)
        tot_awarded = min(tot_awarded, final_max_marks)
        percentage = round((tot_awarded / final_max_marks) * 100.0, 2) if final_max_marks > 0 else 0.0

        # Only update database if is_extra_attempt flags actually changed
        old_extra_ids = {a["id"] for a in all_answers if bool(a.get("is_extra_attempt"))}
        if new_extra_ids != old_extra_ids:
            if isinstance(cursor, Session):
                cursor.execute(
                    update(Answer).where(Answer.submission_id == submission_id).values(is_extra_attempt=0)
                )
                if new_extra_ids:
                    cursor.execute(
                        update(Answer).where(Answer.id.in_(list(new_extra_ids))).values(is_extra_attempt=1)
                    )
            else:
                cursor.execute("UPDATE answers SET is_extra_attempt = 0 WHERE submission_id = ?", (submission_id,))
                if new_extra_ids:
                    placeholders = ",".join("?" for _ in new_extra_ids)
                    cursor.execute(f"UPDATE answers SET is_extra_attempt = 1 WHERE id IN ({placeholders})", tuple(new_extra_ids))

        return tot_awarded, final_max_marks, percentage, overall_needs_review

    @staticmethod
    def enforce_invariants_and_save(
        submission_id: str,
        exam_id: str,
        grading_result: StudentGradingExtractionResult,
        rubric_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        return GradingService.process_submission(submission_id, grading_result, rubric_data)

    @staticmethod
    def process_submission(
        submission_id: str,
        grading_result: StudentGradingExtractionResult,
        rubric_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Enforces all grading invariants, validates bounding boxes,
        computes verified totals on backend, and persists answers & regions via SQLAlchemy ORM.
        """
        now = get_iso_now()
        questions_dict = {q["question_id"]: q for q in rubric_data.get("questions", [])}

        with get_session() as session:
            # Check existing manual overrides so we do not overwrite them
            existing_overrides = set(
                session.scalars(
                    select(Answer.question_id).where(
                        Answer.submission_id == submission_id,
                        Answer.is_manual_override == 1
                    )
                ).all()
            )

            answers_to_insert: List[Answer] = []
            regions_to_insert: List[AnswerRegion] = []
            criterion_scores_to_insert: List[CriterionScore] = []

            total_awarded_submission = 0.0
            has_needs_review = False

            # Process each answer from model result
            for ans in grading_result.answers:
                qid = ans.question_id
                rubric_q = questions_dict.get(qid, {})
                max_m = float(rubric_q.get("max_marks", ans.max_marks))
                sec_id = rubric_q.get("section_id") or getattr(ans, "section_id", None)

                # If teacher manually edited this question before, preserve manual values!
                if qid in existing_overrides:
                    continue

                # Invariant 1: awarded_marks in range [0, max_m]
                raw_awarded = ans.awarded_marks
                validated_awarded = max(0.0, min(float(raw_awarded), max_m))

                # Invariant 2: Criterion-level validation with deterministic kill-switch
                validated_crit_scores = []
                if ans.is_missing:
                    validated_awarded = 0.0
                elif ans.criterion_scores:
                    crit_sum = 0.0
                    for c in ans.criterion_scores:
                        c_max = float(c.max_marks)
                        c_awarded = _enforce_evidence_grounding_and_verdict(
                            awarded_marks=c.awarded_marks,
                            max_marks=c_max,
                            evidence=c.evidence,
                            extracted_student_answer=ans.extracted_student_answer
                        )
                        crit_sum += c_awarded
                        validated_crit_scores.append((c.criterion_id, c.description, c_max, c_awarded, c.evidence))
                    validated_awarded = max(0.0, min(crit_sum, max_m))

                total_awarded_submission += validated_awarded
                if ans.needs_review:
                    has_needs_review = True

                def _clean_str(val):
                    return val.replace("\x00", "") if isinstance(val, str) else val

                ans_id = str(uuid.uuid4())
                answers_to_insert.append(Answer(
                    id=ans_id,
                    submission_id=submission_id,
                    question_id=qid,
                    subquestion_id=ans.subquestion_id,
                    section_id=sec_id,
                    is_extra_attempt=0,
                    page_number=ans.page_number,
                    extracted_text=_clean_str(ans.extracted_student_answer),
                    max_marks=max_m,
                    awarded_marks=validated_awarded,
                    grading_rationale=_clean_str(ans.grading_rationale),
                    transcription_uncertainty=ans.transcription_uncertainty,
                    grading_uncertainty=ans.grading_uncertainty,
                    needs_review=1 if ans.needs_review else 0,
                    review_reason=_clean_str(ans.review_reason),
                    is_missing=1 if ans.is_missing else 0,
                    is_manual_override=0,
                    created_at=now,
                    updated_at=now,
                ))

                for c_tuple in validated_crit_scores:
                    cid, c_desc, c_max, c_awarded, c_evid = c_tuple
                    criterion_scores_to_insert.append(CriterionScore(
                        id=str(uuid.uuid4()),
                        answer_id=ans_id,
                        criterion_id=cid,
                        description=_clean_str(c_desc),
                        max_marks=c_max,
                        awarded_marks=c_awarded,
                        evidence=_clean_str(c_evid),
                        is_manual_override=0,
                        created_at=now,
                    ))

                # Regions bounding box validation
                for reg in ans.regions:
                    rx = max(0.0, min(1.0, reg.x))
                    ry = max(0.0, min(1.0, reg.y))
                    rw = max(0.01, min(1.0 - rx, reg.width))
                    rh = max(0.01, min(1.0 - ry, reg.height))
                    regions_to_insert.append(AnswerRegion(
                        id=str(uuid.uuid4()),
                        answer_id=ans_id,
                        page_number=reg.page_number,
                        x=rx,
                        y=ry,
                        width=rw,
                        height=rh,
                        is_manual_override=0,
                        created_at=now,
                    ))

            # Delete old non-override answers (cascading deletes child regions & scores)
            if not existing_overrides:
                session.execute(delete(Answer).where(Answer.submission_id == submission_id))
            else:
                session.execute(
                    delete(Answer).where(
                        Answer.submission_id == submission_id,
                        Answer.is_manual_override == 0
                    )
                )

            # Insert validated records
            if answers_to_insert:
                session.add_all(answers_to_insert)
            if criterion_scores_to_insert:
                session.add_all(criterion_scores_to_insert)
            if regions_to_insert:
                session.add_all(regions_to_insert)

            session.flush()

            # Recompute total with Section Attempt Limits / Best-of-N
            tot_award, tot_max, percentage, overall_needs_review = GradingService.apply_best_of_n_and_compute_totals(
                session, submission_id, rubric_data, now
            )
            final_status = "NEEDS_REVIEW" if overall_needs_review else "COMPLETED"

            # Calculate 15-day storage retention expiration date
            retention_expiry = RetentionService.calculate_retention_expiry(now, settings.SUBMISSION_RETENTION_DAYS)

            sub = session.scalar(select(Submission).where(Submission.id == submission_id))
            if sub:
                sub.total_awarded_marks = tot_award
                sub.max_marks = tot_max
                sub.percentage = percentage
                sub.status = final_status
                if not sub.graded_at:
                    sub.graded_at = now
                sub.ttl_days = settings.SUBMISSION_RETENTION_DAYS
                if not sub.retention_expires_at:
                    sub.retention_expires_at = retention_expiry

                if grading_result.student_name_detected and (not sub.student_name or sub.student_name == 'Unknown Student'):
                    sub.student_name = grading_result.student_name_detected
                if grading_result.roll_number_detected and (not sub.roll_number or sub.roll_number == 'UNASSIGNED'):
                    sub.roll_number = grading_result.roll_number_detected

                sub.updated_at = now

            session.commit()

        # Generate cropped preview images for each answer's primary region
        GradingService.generate_answer_crops_for_submission(submission_id)

        # Generate PyMuPDF annotated export PDF
        GradingService.generate_export_pdf_for_submission(submission_id)

        return GradingService.get_submission_details(submission_id)

    @staticmethod
    def generate_answer_crops_for_submission(submission_id: str):
        renders_dir = settings.RENDERS_DIR / submission_id
        crops_dir = renders_dir / "crops"
        crops_dir.mkdir(parents=True, exist_ok=True)

        with get_session() as session:
            rows = session.execute(
                select(
                    Answer.id.label("ans_id"),
                    Answer.question_id,
                    AnswerRegion.id.label("reg_id"),
                    AnswerRegion.page_number,
                    AnswerRegion.x,
                    AnswerRegion.y,
                    AnswerRegion.width,
                    AnswerRegion.height
                )
                .join(AnswerRegion, Answer.id == AnswerRegion.answer_id)
                .where(Answer.submission_id == submission_id)
                .order_by(AnswerRegion.page_number.asc(), AnswerRegion.y.asc())
            ).all()

            for row in rows:
                ans_id = row.ans_id
                reg_id = row.reg_id
                page_num = row.page_number
                page_img = renders_dir / f"page_{page_num}.png"
                
                # Region-specific crop
                reg_crop_path = crops_dir / f"crop_{ans_id}_{reg_id}.png"
                if page_img.exists() and not reg_crop_path.exists():
                    pdf_service.crop_answer_region(
                        page_img_path=page_img,
                        x=row.x,
                        y=row.y,
                        width=row.width,
                        height=row.height,
                        output_crop_path=reg_crop_path
                    )

                # Primary answer crop (first region)
                primary_crop_path = crops_dir / f"crop_{ans_id}.png"
                if page_img.exists() and not primary_crop_path.exists():
                    pdf_service.crop_answer_region(
                        page_img_path=page_img,
                        x=row.x,
                        y=row.y,
                        width=row.width,
                        height=row.height,
                        output_crop_path=primary_crop_path
                    )

    @staticmethod
    def trigger_background_export_pdf(submission_id: str):
        """
        Asynchronously regenerates the annotated PDF in the background so that
        interactive modal saves and edits return to the teacher immediately without lag.
        Also invalidates the cached PDF file so any concurrent export downloads fetch fresh data.
        """
        try:
            annotated_path = settings.EXPORTS_DIR / f"{submission_id}_annotated.pdf"
            if annotated_path.exists():
                annotated_path.unlink()
        except Exception:
            pass

        t = threading.Thread(
            target=GradingService.generate_export_pdf_for_submission,
            args=(submission_id,),
            daemon=True,
            name=f"pdf-gen-{submission_id}"
        )
        t.start()

    @staticmethod
    def generate_export_pdf_for_submission(submission_id: str):
        with get_session() as session:
            sub = session.scalar(select(Submission).where(Submission.id == submission_id))
            if not sub or not sub.canonical_pdf_path:
                return

            orig_pdf = Path(sub.canonical_pdf_path)
            if not orig_pdf.is_file() or not orig_pdf.exists():
                try:
                    storage = get_storage_service()
                    orig_pdf = storage.get_local_path_or_download(sub.canonical_pdf_path)
                except Exception:
                    return
            export_pdf = settings.EXPORTS_DIR / f"{submission_id}_annotated.pdf"

            # Gather answers with regions
            answers_raw = session.scalars(
                select(Answer).where(Answer.submission_id == submission_id)
            ).all()

            regions = session.scalars(
                select(AnswerRegion)
                .join(Answer, AnswerRegion.answer_id == Answer.id)
                .where(Answer.submission_id == submission_id)
                .order_by(AnswerRegion.page_number.asc(), AnswerRegion.y.asc())
            ).all()

            regions_by_ans: Dict[str, List[Dict[str, Any]]] = {}
            for r in regions:
                regions_by_ans.setdefault(r.answer_id, []).append({
                    "answer_id": r.answer_id,
                    "page_number": r.page_number,
                    "x": r.x,
                    "y": r.y,
                    "width": r.width,
                    "height": r.height,
                })

            answers_list = []
            for a in answers_raw:
                ans_dict = {
                    "id": a.id,
                    "question_id": a.question_id,
                    "max_marks": a.max_marks,
                    "awarded_marks": a.awarded_marks,
                    "needs_review": a.needs_review,
                    "is_extra_attempt": a.is_extra_attempt,
                    "regions": regions_by_ans.get(a.id, []),
                }
                answers_list.append(ans_dict)

            pdf_service.generate_annotated_pdf(
                orig_pdf,
                export_pdf,
                answers_list,
                total_awarded_marks=sub.total_awarded_marks,
                max_marks=sub.max_marks,
                student_name=sub.student_name,
                roll_number=sub.roll_number
            )

    @staticmethod
    def get_submission_details(submission_id: str) -> Optional[Dict[str, Any]]:
        with get_session() as session:
            sub = session.scalar(select(Submission).where(Submission.id == submission_id))
            if not sub:
                return None

            exam = session.scalar(select(Exam).where(Exam.id == sub.exam_id)) if sub.exam_id else None

            rub_row = session.scalar(
                select(RubricVersion)
                .where(RubricVersion.exam_id == sub.exam_id, RubricVersion.is_approved == 1)
                .order_by(RubricVersion.version_num.desc())
                .limit(1)
            )
            rubric_data = json.loads(rub_row.rubric_data) if rub_row and rub_row.rubric_data else {}

            answers_raw = session.scalars(
                select(Answer).where(Answer.submission_id == submission_id).order_by(Answer.question_id.asc())
            ).all()

            all_regions = session.scalars(
                select(AnswerRegion)
                .join(Answer, AnswerRegion.answer_id == Answer.id)
                .where(Answer.submission_id == submission_id)
                .order_by(AnswerRegion.page_number.asc(), AnswerRegion.y.asc())
            ).all()

            all_criteria = session.scalars(
                select(CriterionScore)
                .join(Answer, CriterionScore.answer_id == Answer.id)
                .where(Answer.submission_id == submission_id)
            ).all()

            reval_objs = session.scalars(
                select(RevaluationRequest)
                .where(RevaluationRequest.submission_id == submission_id)
                .order_by(RevaluationRequest.requested_at.desc())
            ).all()
            reval_rows = [
                {
                    "id": r.id,
                    "submission_id": r.submission_id,
                    "student_id": r.student_id,
                    "question_ids_json": r.question_ids_json,
                    "student_reason": r.student_reason,
                    "status": r.status,
                    "decision": r.decision,
                    "reviewer_notes": r.reviewer_notes,
                    "resolution_notes": r.reviewer_notes,
                    "delta_marks": getattr(r, "delta_marks", None),
                    "resolved_by": r.resolved_by,
                    "requested_at": r.requested_at,
                    "resolved_at": r.resolved_at,
                }
                for r in reval_objs
            ]

            audit_objs = session.scalars(
                select(AuditLog)
                .where(AuditLog.resource_id == submission_id)
                .order_by(AuditLog.created_at.desc())
            ).all()
            audit_logs = [
                {
                    "id": l.id,
                    "user_id": l.user_id,
                    "submission_id": l.submission_id,
                    "answer_id": l.answer_id,
                    "field_name": l.field_name,
                    "old_value": l.old_value,
                    "new_value": l.new_value,
                    "reason": l.reason,
                    "edited_by": l.edited_by,
                    "action": l.action,
                    "resource_type": l.resource_type,
                    "resource_id": l.resource_id,
                    "details_json": l.details_json,
                    "ip_address": l.ip_address,
                    "created_at": l.created_at,
                }
                for l in audit_objs
            ]

            res = {
                "id": sub.id,
                "exam_id": sub.exam_id,
                "batch_id": sub.batch_id,
                "student_id": sub.student_id,
                "student_name": sub.student_name,
                "roll_number": sub.roll_number,
                "status": sub.status,
                "submission_status": sub.submission_status,
                "publication_status": sub.publication_status,
                "page_count": sub.page_count,
                "total_awarded_marks": sub.total_awarded_marks,
                "max_marks": sub.max_marks,
                "percentage": sub.percentage,
                "original_file_path": sub.original_file_path,
                "canonical_pdf_path": sub.canonical_pdf_path,
                "annotated_pdf_path": sub.annotated_pdf_path,
                "error_message": sub.error_message,
                "retry_count": sub.retry_count,
                "created_at": sub.created_at,
                "updated_at": sub.updated_at,
                "graded_at": sub.graded_at,
                "reviewed_at": sub.reviewed_at,
                "is_manual_override": bool(sub.is_manual_override),
                "is_document_purged": bool(sub.is_document_purged),
                "purged_at": sub.purged_at,
                "ttl_days": sub.ttl_days,
                "retention_expires_at": sub.retention_expires_at,
                "exam": {
                    "id": exam.id if exam else sub.exam_id,
                    "title": exam.title if exam else None,
                    "subject": exam.subject if exam else None,
                    "total_marks": exam.total_marks if exam else None,
                    "is_published": exam.is_published if exam else 0,
                    "has_question_paper": bool(exam.question_paper_path) if exam else False,
                    "has_answer_key": bool(exam.answer_key_path) if exam else False,
                    "is_document_purged": bool(exam.is_document_purged) if exam else False,
                },
                "rubric": rubric_data,
            }

        # Assembly in memory (zero DB latency)
        rubric_q_map = {q["question_id"]: q for q in rubric_data.get("questions", [])}
        regions_by_ans = {}
        for r in all_regions:
            rd = {
                "id": r.id,
                "answer_id": r.answer_id,
                "page_number": r.page_number,
                "x": r.x,
                "y": r.y,
                "width": r.width,
                "height": r.height,
                "is_manual_override": r.is_manual_override,
                "created_at": r.created_at,
            }
            regions_by_ans.setdefault(r.answer_id, []).append(rd)

        criteria_by_ans = {}
        for c in all_criteria:
            cd = {
                "id": c.id,
                "answer_id": c.answer_id,
                "criterion_id": c.criterion_id,
                "description": c.description,
                "max_marks": c.max_marks,
                "awarded_marks": c.awarded_marks,
                "evidence": c.evidence,
                "is_manual_override": c.is_manual_override,
                "created_at": c.created_at,
            }
            criteria_by_ans.setdefault(c.answer_id, []).append(cd)

        crops_dir = settings.RENDERS_DIR / submission_id / "crops"
        existing_crops = set()
        if crops_dir.is_dir():
            try:
                existing_crops = {f.name for f in crops_dir.iterdir() if f.is_file()}
            except Exception:
                pass

        answers = []
        for a in answers_raw:
            a_dict = {
                "id": a.id,
                "submission_id": a.submission_id,
                "question_id": a.question_id,
                "subquestion_id": a.subquestion_id,
                "section_id": a.section_id,
                "page_number": a.page_number,
                "extracted_text": a.extracted_text,
                "max_marks": a.max_marks,
                "awarded_marks": a.awarded_marks,
                "grading_rationale": a.grading_rationale,
                "transcription_uncertainty": a.transcription_uncertainty,
                "grading_uncertainty": a.grading_uncertainty,
                "needs_review": bool(a.needs_review),
                "review_reason": a.review_reason,
                "is_missing": bool(a.is_missing),
                "is_manual_override": bool(a.is_manual_override),
                "is_extra_attempt": bool(a.is_extra_attempt),
                "created_at": a.created_at,
                "updated_at": a.updated_at,
            }
            q_info = rubric_q_map.get(a.question_id, {})
            a_dict["official_answer"] = q_info.get("official_answer", "")
            a_dict["question_text"] = q_info.get("question_text", "")
            a_dict["rubric_criteria"] = q_info.get("criteria", [])

            # Regions with per-region crop URLs
            ans_regs = regions_by_ans.get(a.id, [])
            for r in ans_regs:
                reg_crop_name = f"crop_{a.id}_{r['id']}.png"
                r["crop_url"] = f"/api/grading/crop/{submission_id}/{a.id}?region_id={r['id']}" if reg_crop_name in existing_crops else None
            a_dict["regions"] = ans_regs

            # Criterion scores
            a_dict["criterion_scores"] = criteria_by_ans.get(a.id, [])

            # Primary crop
            primary_crop_name = f"crop_{a.id}.png"
            has_crop = primary_crop_name in existing_crops
            a_dict["has_crop"] = has_crop
            a_dict["crop_url"] = f"/api/grading/crop/{submission_id}/{a.id}" if has_crop else None

            # Revaluation matching
            qid = str(a.question_id or "")
            matching_reval = None
            for r in reval_rows:
                try:
                    q_ids = json.loads(r.get("question_ids_json") or "[]")
                except Exception:
                    q_ids = []
                norm_qids = [str(x).lower().replace("q_", "").replace("q", "").replace(".", "") for x in q_ids]
                norm_curr = qid.lower().replace("q_", "").replace("q", "").replace(".", "")
                if qid in q_ids or norm_curr in norm_qids:
                    matching_reval = r
                    break
            if matching_reval:
                a_dict["revaluation"] = {
                    "id": matching_reval["id"],
                    "status": matching_reval["status"],
                    "decision": matching_reval.get("decision"),
                    "student_reason": matching_reval.get("student_reason"),
                    "reviewer_notes": matching_reval.get("reviewer_notes"),
                    "requested_at": matching_reval.get("requested_at"),
                    "resolved_at": matching_reval.get("resolved_at"),
                }
            else:
                a_dict["revaluation"] = None

            answers.append(a_dict)

        res["answers"] = answers
        res["revaluation_requests"] = reval_rows
        res["audit_logs"] = audit_logs
        res["missing_answers"] = [
            a for a in answers if a.get("is_missing") or len(a.get("regions", [])) == 0
        ]

        # Storage Retention & 15-day TTL Lifecycle Info
        retention_info = RetentionService.get_retention_info(res)
        if retention_info.get("is_expired") and not res.get("is_document_purged"):
            RetentionService.purge_submission_documents(submission_id)
            retention_info = RetentionService.get_retention_info({**res, "is_document_purged": 1})
        res.update(retention_info)

        return res

    @staticmethod
    def manual_edit_answer(
        submission_id: str,
        answer_id: str,
        edit_req: ManualEditAnswerRequest
    ) -> Dict[str, Any]:
        """
        Applies teacher correction, creates audit log, recalculates totals immediately via ORM.
        """
        now = get_iso_now()
        with get_session() as session:
            old_ans = session.scalar(
                select(Answer).where(Answer.id == answer_id, Answer.submission_id == submission_id)
            )
            if not old_ans:
                raise ValueError("Answer record not found.")

            # Record audit logs for each changed field in batch
            audit_entries: List[AuditLog] = []
            if edit_req.awarded_marks is not None and edit_req.awarded_marks != old_ans.awarded_marks:
                audit_entries.append(AuditLog(
                    id=str(uuid.uuid4()),
                    user_id="teacher",
                    submission_id=submission_id,
                    answer_id=answer_id,
                    field_name="awarded_marks",
                    old_value=str(old_ans.awarded_marks),
                    new_value=str(edit_req.awarded_marks),
                    reason=edit_req.reason,
                    edited_by="teacher",
                    action="MANUAL_EDIT",
                    resource_type="ANSWER",
                    resource_id=submission_id,
                    details_json=json.dumps({
                        "answer_id": answer_id,
                        "field_name": "awarded_marks",
                        "old_value": str(old_ans.awarded_marks),
                        "new_value": str(edit_req.awarded_marks),
                        "reason": edit_req.reason
                    }),
                    created_at=now
                ))

            if edit_req.extracted_text is not None and edit_req.extracted_text != old_ans.extracted_text:
                audit_entries.append(AuditLog(
                    id=str(uuid.uuid4()),
                    user_id="teacher",
                    submission_id=submission_id,
                    answer_id=answer_id,
                    field_name="extracted_text",
                    old_value=old_ans.extracted_text,
                    new_value=edit_req.extracted_text,
                    reason=edit_req.reason,
                    edited_by="teacher",
                    action="MANUAL_EDIT",
                    resource_type="ANSWER",
                    resource_id=submission_id,
                    details_json=json.dumps({
                        "answer_id": answer_id,
                        "field_name": "extracted_text",
                        "old_value": old_ans.extracted_text,
                        "new_value": edit_req.extracted_text,
                        "reason": edit_req.reason
                    }),
                    created_at=now
                ))

            if edit_req.grading_rationale is not None and edit_req.grading_rationale != old_ans.grading_rationale:
                audit_entries.append(AuditLog(
                    id=str(uuid.uuid4()),
                    user_id="teacher",
                    submission_id=submission_id,
                    answer_id=answer_id,
                    field_name="grading_rationale",
                    old_value=old_ans.grading_rationale,
                    new_value=edit_req.grading_rationale,
                    reason=edit_req.reason,
                    edited_by="teacher",
                    action="MANUAL_EDIT",
                    resource_type="ANSWER",
                    resource_id=submission_id,
                    details_json=json.dumps({
                        "answer_id": answer_id,
                        "field_name": "grading_rationale",
                        "old_value": old_ans.grading_rationale,
                        "new_value": edit_req.grading_rationale,
                        "reason": edit_req.reason
                    }),
                    created_at=now
                ))

            if edit_req.question_id is not None and edit_req.question_id != old_ans.question_id:
                audit_entries.append(AuditLog(
                    id=str(uuid.uuid4()),
                    user_id="teacher",
                    submission_id=submission_id,
                    answer_id=answer_id,
                    field_name="question_id",
                    old_value=old_ans.question_id,
                    new_value=edit_req.question_id,
                    reason=edit_req.reason,
                    edited_by="teacher",
                    action="MANUAL_EDIT",
                    resource_type="ANSWER",
                    resource_id=submission_id,
                    details_json=json.dumps({
                        "answer_id": answer_id,
                        "field_name": "question_id",
                        "old_value": old_ans.question_id,
                        "new_value": edit_req.question_id,
                        "reason": edit_req.reason
                    }),
                    created_at=now
                ))

            if audit_entries:
                session.add_all(audit_entries)

            # Update answer
            new_awarded = old_ans.awarded_marks if edit_req.awarded_marks is None else edit_req.awarded_marks
            new_awarded = max(0.0, min(float(new_awarded), float(old_ans.max_marks)))
            new_text = old_ans.extracted_text if edit_req.extracted_text is None else edit_req.extracted_text
            new_rationale = old_ans.grading_rationale if edit_req.grading_rationale is None else edit_req.grading_rationale
            new_qid = old_ans.question_id if edit_req.question_id is None else edit_req.question_id
            new_needs_review = old_ans.needs_review if edit_req.needs_review is None else (1 if edit_req.needs_review else 0)

            old_ans.awarded_marks = new_awarded
            old_ans.extracted_text = new_text
            old_ans.grading_rationale = new_rationale
            old_ans.question_id = new_qid
            old_ans.needs_review = new_needs_review
            old_ans.is_manual_override = 1
            old_ans.updated_at = now

            # Update criterion scores if supplied
            if edit_req.criterion_scores:
                for c in edit_req.criterion_scores:
                    crit = session.scalar(
                        select(CriterionScore).where(
                            CriterionScore.answer_id == answer_id,
                            CriterionScore.criterion_id == c.criterion_id
                        )
                    )
                    if crit:
                        crit.awarded_marks = c.awarded_marks
                        crit.evidence = c.evidence
                        crit.is_manual_override = 1

            # Recalculate submission totals with Best-of-N and Section limits
            sub = session.scalar(select(Submission).where(Submission.id == submission_id))
            rub_r = session.scalar(
                select(RubricVersion)
                .where(RubricVersion.exam_id == sub.exam_id, RubricVersion.is_approved == 1)
                .order_by(RubricVersion.version_num.desc())
                .limit(1)
            )
            rubric_data = json.loads(rub_r.rubric_data) if rub_r and rub_r.rubric_data else {}

            tot_awarded, tot_max, pct, overall_needs_review = GradingService.apply_best_of_n_and_compute_totals(
                session, submission_id, rubric_data, now
            )

            if sub:
                sub.total_awarded_marks = tot_awarded
                sub.max_marks = tot_max
                sub.percentage = pct
                sub.is_manual_override = 1
                sub.status = 'NEEDS_REVIEW' if overall_needs_review else 'COMPLETED'
                sub.reviewed_at = now
                sub.updated_at = now

            session.commit()

        # Re-export annotated PDF asynchronously in background
        GradingService.trigger_background_export_pdf(submission_id)
        return GradingService.get_submission_details(submission_id)

    @staticmethod
    def manual_edit_region(
        submission_id: str,
        region_id: str,
        edit_req: ManualEditRegionRequest
    ) -> Dict[str, Any]:
        """
        Adjusts bounding box coordinates or adds a new multi-page region,
        writes audit log, updates crops & export PDF via ORM.
        """
        now = get_iso_now()
        is_new_addition = (
            region_id.startswith("draft-add-")
            or region_id.startswith("draft-new-")
            or region_id.startswith("new-")
            or region_id == "new"
        )

        with get_session() as session:
            old_reg = None
            if not is_new_addition:
                old_reg = session.scalar(select(AnswerRegion).where(AnswerRegion.id == region_id))
                if not old_reg:
                    old_reg = session.scalar(
                        select(AnswerRegion).where(AnswerRegion.answer_id == region_id).order_by(AnswerRegion.id.asc()).limit(1)
                    )

            if not old_reg:
                # Handle newly created bounding box for an answer (e.g. multi-page continuation or previously missing)
                target_ans_id = edit_req.answer_id
                if not target_ans_id:
                    if region_id.startswith("draft-add-"):
                        match_m = re.match(r"^draft-add-(.+)-(\d+)$", region_id)
                        if match_m:
                            target_ans_id = match_m.group(1)
                        else:
                            target_ans_id = region_id.replace("draft-add-", "")
                    elif region_id.startswith("draft-new-"):
                        target_ans_id = region_id.replace("draft-new-", "")
                    elif region_id.startswith("new-"):
                        target_ans_id = region_id.replace("new-", "")
                    else:
                        target_ans_id = region_id

                target_ans = session.scalar(
                    select(Answer).where(Answer.id == target_ans_id, Answer.submission_id == submission_id)
                )
                if not target_ans:
                    target_ans = session.scalar(
                        select(Answer).where(Answer.question_id == target_ans_id, Answer.submission_id == submission_id)
                    )
                if target_ans:
                    new_reg_id = f"reg_{uuid.uuid4().hex[:12]}"
                    old_reg = AnswerRegion(
                        id=new_reg_id,
                        answer_id=target_ans.id,
                        page_number=edit_req.page_number,
                        x=edit_req.x,
                        y=edit_req.y,
                        width=edit_req.width,
                        height=edit_req.height,
                        is_manual_override=1,
                    )
                    session.add(old_reg)
                    target_ans.is_missing = 0
                    session.flush()
                else:
                    raise ValueError(f"Region or Answer record not found for id={region_id}, answer_id={target_ans_id}")

            actual_region_id = old_reg.id
            ans_id = old_reg.answer_id

            session.add(AuditLog(
                id=str(uuid.uuid4()),
                user_id="teacher",
                submission_id=submission_id,
                answer_id=ans_id,
                field_name="bounding_box",
                old_value=f"[{old_reg.x:.2f}, {old_reg.y:.2f}, {old_reg.width:.2f}, {old_reg.height:.2f}]",
                new_value=f"[{edit_req.x:.2f}, {edit_req.y:.2f}, {edit_req.width:.2f}, {edit_req.height:.2f}]",
                reason=edit_req.reason,
                edited_by="teacher",
                action="ADD_REGION" if is_new_addition else "MANUAL_EDIT",
                resource_type="REGION",
                resource_id=submission_id,
                details_json=json.dumps({
                    "answer_id": ans_id,
                    "region_id": actual_region_id,
                    "field_name": "bounding_box",
                    "old_value": f"[{old_reg.x:.2f}, {old_reg.y:.2f}, {old_reg.width:.2f}, {old_reg.height:.2f}]",
                    "new_value": f"[{edit_req.x:.2f}, {edit_req.y:.2f}, {edit_req.width:.2f}, {edit_req.height:.2f}]",
                    "reason": edit_req.reason
                }),
                created_at=now
            ))

            old_reg.page_number = edit_req.page_number
            old_reg.x = edit_req.x
            old_reg.y = edit_req.y
            old_reg.width = edit_req.width
            old_reg.height = edit_req.height
            old_reg.is_manual_override = 1

            ans = session.scalar(select(Answer).where(Answer.id == ans_id))
            if ans:
                all_pages = session.scalars(
                    select(AnswerRegion.page_number).where(AnswerRegion.answer_id == ans_id)
                ).all()
                if all_pages:
                    ans.page_number = min(all_pages)
                else:
                    ans.page_number = edit_req.page_number
                ans.is_missing = 0
                ans.updated_at = now

            sub = session.scalar(select(Submission).where(Submission.id == submission_id))
            if sub:
                sub.updated_at = now

            session.commit()

        # Re-crop answer image
        renders_dir = settings.RENDERS_DIR / submission_id
        crops_dir = renders_dir / "crops"
        crops_dir.mkdir(parents=True, exist_ok=True)
        page_img = renders_dir / f"page_{edit_req.page_number}.png"
        crop_path = crops_dir / f"crop_{ans_id}.png"
        reg_crop_path = crops_dir / f"crop_{ans_id}_{actual_region_id}.png"

        if not page_img.exists():
            with get_session() as session:
                sub = session.scalar(select(Submission).where(Submission.id == submission_id))
                if sub:
                    key = sub.canonical_pdf_path or sub.original_file_path
                    if key:
                        try:
                            storage = get_storage_service()
                            local_pdf = storage.get_local_path_or_download(key)
                            pdf_service.render_pdf_pages_to_images(local_pdf, submission_id)
                        except Exception:
                            pass

        if page_img.exists():
            pdf_service.crop_answer_region(page_img, edit_req.x, edit_req.y, edit_req.width, edit_req.height, reg_crop_path)
            with get_session() as session:
                first_reg = session.scalar(
                    select(AnswerRegion)
                    .where(AnswerRegion.answer_id == ans_id)
                    .order_by(AnswerRegion.page_number.asc(), AnswerRegion.y.asc())
                    .limit(1)
                )
                if (first_reg and first_reg.id == actual_region_id) or not crop_path.exists():
                    pdf_service.crop_answer_region(page_img, edit_req.x, edit_req.y, edit_req.width, edit_req.height, crop_path)

        # Re-export annotated PDF asynchronously in background
        GradingService.trigger_background_export_pdf(submission_id)
        return GradingService.get_submission_details(submission_id)

    @staticmethod
    def delete_region(submission_id: str, region_id: str) -> Dict[str, Any]:
        """
        Deletes a specific bounding box region from an answer.
        Updates answer page_number, re-exports PDF, and recalculates totals.
        """
        now = get_iso_now()
        with get_session() as session:
            reg = session.scalar(select(AnswerRegion).where(AnswerRegion.id == region_id))
            if not reg:
                raise ValueError(f"Region {region_id} not found")

            ans_id = reg.answer_id
            ans = session.scalar(select(Answer).where(Answer.id == ans_id, Answer.submission_id == submission_id))
            if not ans:
                raise ValueError(f"Answer for region {region_id} not found")

            session.add(AuditLog(
                id=str(uuid.uuid4()),
                user_id="teacher",
                submission_id=submission_id,
                answer_id=ans_id,
                field_name="bounding_box",
                old_value=f"[Page {reg.page_number}: {reg.x:.2f}, {reg.y:.2f}, {reg.width:.2f}, {reg.height:.2f}]",
                new_value="DELETED",
                reason="Teacher deleted bounding box region",
                edited_by="teacher",
                action="DELETE_REGION",
                resource_type="REGION",
                resource_id=region_id,
                details_json=json.dumps({
                    "answer_id": ans_id,
                    "region_id": region_id,
                    "page_number": reg.page_number
                }),
                created_at=now
            ))

            session.delete(reg)
            session.flush()

            # Check remaining regions for this answer
            remaining_regions = session.scalars(
                select(AnswerRegion)
                .where(AnswerRegion.answer_id == ans_id)
                .order_by(AnswerRegion.page_number.asc(), AnswerRegion.y.asc())
            ).all()

            if remaining_regions:
                ans.page_number = remaining_regions[0].page_number
                ans.is_missing = 0
            else:
                ans.page_number = None
                ans.is_missing = 1

            ans.updated_at = now
            sub = session.scalar(select(Submission).where(Submission.id == submission_id))
            if sub:
                sub.updated_at = now

            session.commit()

        # Clean up crop files
        renders_dir = settings.RENDERS_DIR / submission_id
        crops_dir = renders_dir / "crops"
        reg_crop = crops_dir / f"crop_{ans_id}_{region_id}.png"
        if reg_crop.exists():
            try:
                reg_crop.unlink()
            except Exception:
                pass

        primary_crop = crops_dir / f"crop_{ans_id}.png"
        if not remaining_regions:
            if primary_crop.exists():
                try:
                    primary_crop.unlink()
                except Exception:
                    pass
        else:
            first_rem = remaining_regions[0]
            first_rem_crop = crops_dir / f"crop_{ans_id}_{first_rem.id}.png"
            if first_rem_crop.exists():
                try:
                    shutil.copy2(first_rem_crop, primary_crop)
                except Exception:
                    pass
            else:
                page_img = renders_dir / f"page_{first_rem.page_number}.png"
                if page_img.exists():
                    try:
                        pdf_service.crop_answer_region(page_img, first_rem.x, first_rem.y, first_rem.width, first_rem.height, primary_crop)
                    except Exception:
                        pass

        GradingService.trigger_background_export_pdf(submission_id)
        return GradingService.get_submission_details(submission_id)

    @staticmethod
    def clear_all_review_flags(submission_id: str, reviewer: str = "teacher") -> Dict[str, Any]:
        """
        Unflags all questions in a submission from 'needs_review' in a single bulk action.
        Sets answers.needs_review = 0, answers.review_reason = NULL,
        recalculates Best-of-N totals, updates submission status to 'COMPLETED',
        logs audit entries, and regenerates the annotated PDF.
        """
        now = get_iso_now()
        with get_session() as session:
            sub = session.scalar(select(Submission).where(Submission.id == submission_id))
            if not sub:
                raise ValueError(f"Submission {submission_id} not found")

            flagged_answers = session.scalars(
                select(Answer).where(Answer.submission_id == submission_id, Answer.needs_review == 1)
            ).all()

            audit_entries = [
                AuditLog(
                    id=str(uuid.uuid4()),
                    user_id=reviewer,
                    action="CLEAR_REVIEW",
                    resource_type="ANSWER",
                    resource_id=submission_id,
                    details_json=json.dumps({
                        "answer_id": fa.id,
                        "field_name": "needs_review",
                        "old_value": "1",
                        "new_value": "0",
                        "reason": "Bulk unflagged from review"
                    }),
                    created_at=now
                )
                for fa in flagged_answers
            ]
            if audit_entries:
                session.add_all(audit_entries)

            for fa in flagged_answers:
                fa.needs_review = 0
                fa.review_reason = None
                fa.is_manual_override = 1
                fa.updated_at = now

            # Fetch rubric to recalculate totals
            rub_r = session.scalar(
                select(RubricVersion)
                .where(RubricVersion.exam_id == sub.exam_id, RubricVersion.is_approved == 1)
                .order_by(RubricVersion.version_num.desc())
                .limit(1)
            )
            rubric_data = json.loads(rub_r.rubric_data) if rub_r and rub_r.rubric_data else {}

            tot_awarded, tot_max, pct, overall_needs_review = GradingService.apply_best_of_n_and_compute_totals(
                session, submission_id, rubric_data, now
            )

            new_status = 'NEEDS_REVIEW' if overall_needs_review else 'COMPLETED'
            sub.total_awarded_marks = tot_awarded
            sub.max_marks = tot_max
            sub.percentage = pct
            sub.is_manual_override = 1
            sub.status = new_status
            sub.reviewed_at = now
            sub.updated_at = now

            session.commit()

        # Re-export annotated PDF asynchronously in background
        GradingService.trigger_background_export_pdf(submission_id)
        return GradingService.get_submission_details(submission_id)

    @staticmethod
    def bulk_clear_exam_reviews(exam_id: str, reviewer: str = "teacher") -> Dict[str, Any]:
        """
        Clears review flags for all submissions under an exam currently in NEEDS_REVIEW.
        """
        now = get_iso_now()
        with get_session() as session:
            flagged_subs = session.scalars(
                select(Submission).where(Submission.exam_id == exam_id, Submission.status == 'NEEDS_REVIEW')
            ).all()

            # Fetch rubric once for the exam
            rub_r = session.scalar(
                select(RubricVersion)
                .where(RubricVersion.exam_id == exam_id, RubricVersion.is_approved == 1)
                .order_by(RubricVersion.version_num.desc())
                .limit(1)
            )
            rubric_data = json.loads(rub_r.rubric_data) if rub_r and rub_r.rubric_data else {}

            cleared_count = 0
            for sub in flagged_subs:
                try:
                    fas = session.scalars(
                        select(Answer).where(Answer.submission_id == sub.id, Answer.needs_review == 1)
                    ).all()

                    audit_entries = [
                        AuditLog(
                            id=str(uuid.uuid4()),
                            user_id=reviewer,
                            action="CLEAR_REVIEW",
                            resource_type="ANSWER",
                            resource_id=sub.id,
                            details_json=json.dumps({
                                "answer_id": fa.id,
                                "field_name": "needs_review",
                                "old_value": "1",
                                "new_value": "0",
                                "reason": "Bulk unflagged from review"
                            }),
                            created_at=now
                        )
                        for fa in fas
                    ]
                    if audit_entries:
                        session.add_all(audit_entries)

                    for fa in fas:
                        fa.needs_review = 0
                        fa.review_reason = None
                        fa.is_manual_override = 1
                        fa.updated_at = now

                    tot_awarded, tot_max, pct, overall_needs_review = GradingService.apply_best_of_n_and_compute_totals(
                        session, sub.id, rubric_data, now
                    )
                    new_status = 'NEEDS_REVIEW' if overall_needs_review else 'COMPLETED'
                    sub.total_awarded_marks = tot_awarded
                    sub.max_marks = tot_max
                    sub.percentage = pct
                    sub.is_manual_override = 1
                    sub.status = new_status
                    sub.reviewed_at = now
                    sub.updated_at = now

                    session.commit()

                    GradingService.trigger_background_export_pdf(sub.id)
                    cleared_count += 1
                except Exception:
                    pass

        return {
            "success": True,
            "exam_id": exam_id,
            "cleared_count": cleared_count,
            "total_flagged": len(flagged_subs)
        }

grading_service = GradingService()
