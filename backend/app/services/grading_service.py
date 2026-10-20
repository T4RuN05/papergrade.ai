import uuid
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from backend.app.config import settings
from backend.app.database import get_db, get_iso_now, is_postgres
from backend.app.schemas import (
    StudentGradingExtractionResult,
    GradedAnswerItem,
    ManualEditAnswerRequest,
    ManualEditRegionRequest
)
from backend.app.services.pdf_service import pdf_service
from backend.app.services.retention_service import RetentionService
from backend.app.services.storage import get_storage_service

class GradingService:
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
        """
        sections = rubric_data.get("sections", [])
        exam_max_marks = float(rubric_data.get("total_marks") or 0.0)

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
        overall_needs_review = any(bool(a["needs_review"]) for a in all_answers)
        new_extra_ids = set()

        # Process each section with Best-of-N
        for s_id, s_conf in section_meta.items():
            ans_list = sec_answers.get(s_id, [])
            attempt_limit = s_conf.get("attempt_limit")
            sec_max = float(s_conf.get("max_marks") or 0.0)
            calculated_exam_max += sec_max

            if attempt_limit and attempt_limit > 0 and len(ans_list) > 0:
                # Separate attempted from unattempted
                attempted = [a for a in ans_list if not a.get("is_missing") and float(a.get("awarded_marks", 0.0)) > 0]
                unattempted = [a for a in ans_list if a not in attempted]

                # Sort attempted answers by awarded_marks descending (Best of N)
                attempted.sort(key=lambda x: float(x["awarded_marks"]), reverse=True)

                # Keep top attempt_limit
                counted_answers = attempted[:attempt_limit]
                extra_answers = attempted[attempt_limit:]

                # If student didn't reach attempt_limit with non-zero answers, add remaining to fill quota
                slots_left = attempt_limit - len(counted_answers)
                if slots_left > 0 and unattempted:
                    counted_answers.extend(unattempted[:slots_left])
                    extra_answers.extend(unattempted[slots_left:])

                for extra in extra_answers:
                    new_extra_ids.add(extra["id"])

                # Sum awarded marks of counted answers
                sec_awarded = sum(float(a["awarded_marks"]) for a in counted_answers)
                if sec_max > 0:
                    sec_awarded = min(sec_awarded, sec_max)
                tot_awarded += sec_awarded
            else:
                # No limit, all compulsory in this section
                sec_awarded = sum(float(a["awarded_marks"]) for a in ans_list)
                if sec_max > 0:
                    sec_awarded = min(sec_awarded, sec_max)
                tot_awarded += sec_awarded

        # Add unsectioned compulsory questions
        for a in unsectioned_answers:
            tot_awarded += float(a["awarded_marks"])
            calculated_exam_max += float(a["max_marks"])

        # Determine final total max marks
        final_max_marks = exam_max_marks if exam_max_marks > 0 else (calculated_exam_max if calculated_exam_max > 0 else 1.0)
        tot_awarded = min(tot_awarded, final_max_marks)
        percentage = round((tot_awarded / final_max_marks) * 100.0, 2) if final_max_marks > 0 else 0.0

        # Only update database if is_extra_attempt flags actually changed
        old_extra_ids = {a["id"] for a in all_answers if bool(a.get("is_extra_attempt"))}
        if new_extra_ids != old_extra_ids:
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
        computes verified totals on backend, and persists answers & regions.
        """
        now = get_iso_now()
        questions_dict = {q["question_id"]: q for q in rubric_data.get("questions", [])}

        # Check existing manual overrides so we do not overwrite them
        existing_overrides = set()
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT question_id FROM answers WHERE submission_id = ? AND is_manual_override = 1", (submission_id,))
            for row in cursor.fetchall():
                existing_overrides.add(row["question_id"])

        answers_to_insert = []
        regions_to_insert = []
        criterion_scores_to_insert = []

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

            # Invariant 2: Criterion-level validation
            validated_crit_scores = []
            if ans.criterion_scores:
                crit_sum = 0.0
                for c in ans.criterion_scores:
                    c_max = float(c.max_marks)
                    c_awarded = max(0.0, min(float(c.awarded_marks), c_max))
                    crit_sum += c_awarded
                    validated_crit_scores.append((c.criterion_id, c.description, c_max, c_awarded, c.evidence))
                if crit_sum > 0.0 or len(ans.criterion_scores) > 0:
                    validated_awarded = max(0.0, min(crit_sum, max_m))

            total_awarded_submission += validated_awarded
            if ans.needs_review:
                has_needs_review = True

            def _clean_str(val):
                return val.replace("\x00", "") if isinstance(val, str) else val

            ans_id = str(uuid.uuid4())
            answers_to_insert.append((
                ans_id, submission_id, qid, ans.subquestion_id, sec_id, 0,
                ans.page_number, _clean_str(ans.extracted_student_answer), max_m,
                validated_awarded, _clean_str(ans.grading_rationale),
                ans.transcription_uncertainty, ans.grading_uncertainty,
                1 if ans.needs_review else 0, _clean_str(ans.review_reason),
                1 if ans.is_missing else 0, 0, now, now
            ))

            for c_tuple in validated_crit_scores:
                cid, c_desc, c_max, c_awarded, c_evid = c_tuple
                criterion_scores_to_insert.append((
                    str(uuid.uuid4()), ans_id, cid, _clean_str(c_desc), c_max, c_awarded, _clean_str(c_evid), 0, now
                ))

            # Regions bounding box validation
            for reg in ans.regions:
                rx = max(0.0, min(1.0, reg.x))
                ry = max(0.0, min(1.0, reg.y))
                rw = max(0.01, min(1.0 - rx, reg.width))
                rh = max(0.01, min(1.0 - ry, reg.height))
                regions_to_insert.append((
                    str(uuid.uuid4()), ans_id, reg.page_number,
                    rx, ry, rw, rh, 0, now
                ))

        with get_db() as conn:
            cursor = conn.cursor()
            if not existing_overrides:
                cursor.execute("DELETE FROM answers WHERE submission_id = ?", (submission_id,))
            else:
                cursor.execute("DELETE FROM answers WHERE submission_id = ? AND is_manual_override = 0", (submission_id,))

            # Insert validated answers
            cursor.executemany("""
            INSERT INTO answers (
                id, submission_id, question_id, subquestion_id, section_id, is_extra_attempt,
                page_number, extracted_text, max_marks, awarded_marks,
                grading_rationale, transcription_uncertainty, grading_uncertainty,
                needs_review, review_reason, is_missing, is_manual_override,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, answers_to_insert)

            # Insert criterion scores
            cursor.executemany("""
            INSERT INTO criterion_scores (
                id, answer_id, criterion_id, description, max_marks,
                awarded_marks, evidence, is_manual_override, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, criterion_scores_to_insert)

            # Insert regions
            cursor.executemany("""
            INSERT INTO answer_regions (
                id, answer_id, page_number, x, y, width, height,
                is_manual_override, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, regions_to_insert)

            # Recompute total with Section Attempt Limits / Best-of-N
            tot_award, tot_max, percentage, overall_needs_review = GradingService.apply_best_of_n_and_compute_totals(
                cursor, submission_id, rubric_data, now
            )
            final_status = "NEEDS_REVIEW" if overall_needs_review else "COMPLETED"

            # Calculate 15-day storage retention expiration date
            retention_expiry = RetentionService.calculate_retention_expiry(now, settings.SUBMISSION_RETENTION_DAYS)
            params = [tot_award, tot_max, percentage, final_status, now, settings.SUBMISSION_RETENTION_DAYS, retention_expiry]
            detected_name_clause = ""
            if grading_result.student_name_detected:
                detected_name_clause += ", student_name = COALESCE(NULLIF(student_name, 'Unknown Student'), ?)"
                params.append(grading_result.student_name_detected)
            if grading_result.roll_number_detected:
                detected_name_clause += ", roll_number = COALESCE(NULLIF(roll_number, 'UNASSIGNED'), ?)"
                params.append(grading_result.roll_number_detected)
            params.extend([now, submission_id])

            cursor.execute(f"""
            UPDATE submissions
            SET total_awarded_marks = ?, max_marks = ?, percentage = ?, status = ?,
                graded_at = COALESCE(graded_at, ?), ttl_days = ?, retention_expires_at = COALESCE(retention_expires_at, ?)
                {detected_name_clause}, updated_at = ?
            WHERE id = ?
            """, params)

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

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            SELECT a.id as ans_id, a.question_id, r.id as reg_id, r.page_number, r.x, r.y, r.width, r.height
            FROM answers a
            JOIN answer_regions r ON a.id = r.answer_id
            WHERE a.submission_id = ?
            ORDER BY r.page_number ASC, r.y ASC
            """, (submission_id,))
            for row in cursor.fetchall():
                ans_id = row["ans_id"]
                reg_id = row["reg_id"]
                page_num = row["page_number"]
                page_img = renders_dir / f"page_{page_num}.png"
                
                # Region-specific crop
                reg_crop_path = crops_dir / f"crop_{ans_id}_{reg_id}.png"
                if page_img.exists() and not reg_crop_path.exists():
                    pdf_service.crop_answer_region(
                        page_img_path=page_img,
                        x=row["x"],
                        y=row["y"],
                        width=row["width"],
                        height=row["height"],
                        output_crop_path=reg_crop_path
                    )

                # Primary answer crop (first region)
                primary_crop_path = crops_dir / f"crop_{ans_id}.png"
                if page_img.exists() and not primary_crop_path.exists():
                    pdf_service.crop_answer_region(
                        page_img_path=page_img,
                        x=row["x"],
                        y=row["y"],
                        width=row["width"],
                        height=row["height"],
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
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT canonical_pdf_path, student_name, roll_number, total_awarded_marks, max_marks FROM submissions WHERE id = ?", (submission_id,))
            sub_row = cursor.fetchone()
            if not sub_row or not sub_row["canonical_pdf_path"]:
                return

            orig_pdf = Path(sub_row["canonical_pdf_path"])
            if not orig_pdf.is_file() or not orig_pdf.exists():
                try:
                    storage = get_storage_service()
                    orig_pdf = storage.get_local_path_or_download(sub_row["canonical_pdf_path"])
                except Exception:
                    return
            export_pdf = settings.EXPORTS_DIR / f"{submission_id}_annotated.pdf"

            # Gather answers with regions in batch (2 queries total instead of N+1)
            cursor.execute("""
            SELECT id, question_id, max_marks, awarded_marks, needs_review, is_extra_attempt
            FROM answers
            WHERE submission_id = ?
            """, (submission_id,))
            answers_raw = cursor.fetchall()

            cursor.execute("""
            SELECT r.answer_id, r.page_number, r.x, r.y, r.width, r.height
            FROM answer_regions r
            JOIN answers a ON r.answer_id = a.id
            WHERE a.submission_id = ?
            ORDER BY r.page_number ASC, r.y ASC
            """, (submission_id,))
            regions_by_ans: Dict[str, List[Dict[str, Any]]] = {}
            for r in cursor.fetchall():
                regions_by_ans.setdefault(r["answer_id"], []).append(dict(r))

            answers_list = []
            for a_row in answers_raw:
                ans_dict = dict(a_row)
                ans_dict["regions"] = regions_by_ans.get(ans_dict["id"], [])
                answers_list.append(ans_dict)

            pdf_service.generate_annotated_pdf(
                orig_pdf,
                export_pdf,
                answers_list,
                total_awarded_marks=sub_row["total_awarded_marks"],
                max_marks=sub_row["max_marks"],
                student_name=sub_row["student_name"],
                roll_number=sub_row["roll_number"]
            )

    @staticmethod
    def get_submission_details(submission_id: str) -> Optional[Dict[str, Any]]:
        # In Postgres, use ThreadPoolExecutor to run independent batch queries concurrently over the pool
        if is_postgres():
            def fetch_sub_exam_rubric():
                with get_db() as conn:
                    c = conn.cursor()
                    c.execute("""
                    SELECT s.*, 
                           e.title AS exam_title, e.subject AS exam_subject, e.total_marks AS exam_total_marks,
                           e.is_published AS exam_is_published, e.question_paper_path AS exam_question_paper_path,
                           e.answer_key_path AS exam_answer_key_path, e.is_document_purged AS exam_is_document_purged
                    FROM submissions s
                    LEFT JOIN exams e ON s.exam_id = e.id
                    WHERE s.id = ?
                    """, (submission_id,))
                    sub_row = c.fetchone()
                    if not sub_row:
                        return None, {}
                    res = dict(sub_row)
                    res["exam"] = {
                        "id": res["exam_id"],
                        "title": res.pop("exam_title", None),
                        "subject": res.pop("exam_subject", None),
                        "total_marks": res.pop("exam_total_marks", None),
                        "is_published": res.pop("exam_is_published", 0),
                        "has_question_paper": bool(res.pop("exam_question_paper_path", None)),
                        "has_answer_key": bool(res.pop("exam_answer_key_path", None)),
                        "is_document_purged": bool(res.pop("exam_is_document_purged", 0)),
                    }
                    c.execute("""
                    SELECT rubric_data FROM rubric_versions
                    WHERE exam_id = ? AND is_approved = 1
                    ORDER BY version_num DESC LIMIT 1
                    """, (res["exam_id"],))
                    rub_row = c.fetchone()
                    rubric_data = json.loads(rub_row["rubric_data"]) if rub_row and rub_row["rubric_data"] else {}
                    res["rubric"] = rubric_data
                    return res, rubric_data

            def fetch_answers_and_related():
                with get_db() as conn:
                    c = conn.cursor()
                    c.execute("SELECT * FROM answers WHERE submission_id = ? ORDER BY question_id ASC", (submission_id,))
                    answers_raw = c.fetchall()
                    c.execute("""
                    SELECT r.* FROM answer_regions r
                    JOIN answers a ON r.answer_id = a.id
                    WHERE a.submission_id = ?
                    ORDER BY r.page_number ASC, r.y ASC
                    """, (submission_id,))
                    all_regions = c.fetchall()
                    c.execute("""
                    SELECT cs.* FROM criterion_scores cs
                    JOIN answers a ON cs.answer_id = a.id
                    WHERE a.submission_id = ?
                    """, (submission_id,))
                    all_criteria = c.fetchall()
                    return answers_raw, all_regions, all_criteria

            def fetch_reval_and_audit():
                with get_db() as conn:
                    c = conn.cursor()
                    c.execute("SELECT * FROM revaluation_requests WHERE submission_id = ? ORDER BY requested_at DESC", (submission_id,))
                    reval_rows = [dict(r) for r in c.fetchall()]
                    c.execute("SELECT * FROM audit_logs WHERE submission_id = ? ORDER BY created_at DESC", (submission_id,))
                    audit_logs = [dict(log) for log in c.fetchall()]
                    return reval_rows, audit_logs

            with ThreadPoolExecutor(max_workers=3) as executor:
                f_sub = executor.submit(fetch_sub_exam_rubric)
                f_ans = executor.submit(fetch_answers_and_related)
                f_reval = executor.submit(fetch_reval_and_audit)

                res, rubric_data = f_sub.result()
                if not res:
                    return None
                answers_raw, all_regions, all_criteria = f_ans.result()
                reval_rows, audit_logs = f_reval.result()

        else:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                SELECT s.*, 
                       e.title AS exam_title, e.subject AS exam_subject, e.total_marks AS exam_total_marks,
                       e.is_published AS exam_is_published, e.question_paper_path AS exam_question_paper_path,
                       e.answer_key_path AS exam_answer_key_path, e.is_document_purged AS exam_is_document_purged
                FROM submissions s
                LEFT JOIN exams e ON s.exam_id = e.id
                WHERE s.id = ?
                """, (submission_id,))
                sub_row = cursor.fetchone()
                if not sub_row:
                    return None
                res = dict(sub_row)
                res["exam"] = {
                    "id": res["exam_id"],
                    "title": res.pop("exam_title", None),
                    "subject": res.pop("exam_subject", None),
                    "total_marks": res.pop("exam_total_marks", None),
                    "is_published": res.pop("exam_is_published", 0),
                    "has_question_paper": bool(res.pop("exam_question_paper_path", None)),
                    "has_answer_key": bool(res.pop("exam_answer_key_path", None)),
                    "is_document_purged": bool(res.pop("exam_is_document_purged", 0)),
                }

                cursor.execute("""
                SELECT rubric_data FROM rubric_versions
                WHERE exam_id = ? AND is_approved = 1
                ORDER BY version_num DESC LIMIT 1
                """, (res["exam_id"],))
                rub_row = cursor.fetchone()
                rubric_data = json.loads(rub_row["rubric_data"]) if rub_row and rub_row["rubric_data"] else {}
                res["rubric"] = rubric_data

                cursor.execute("SELECT * FROM answers WHERE submission_id = ? ORDER BY question_id ASC", (submission_id,))
                answers_raw = cursor.fetchall()

                cursor.execute("""
                SELECT r.* FROM answer_regions r
                JOIN answers a ON r.answer_id = a.id
                WHERE a.submission_id = ?
                ORDER BY r.page_number ASC, r.y ASC
                """, (submission_id,))
                all_regions = cursor.fetchall()

                cursor.execute("""
                SELECT cs.* FROM criterion_scores cs
                JOIN answers a ON cs.answer_id = a.id
                WHERE a.submission_id = ?
                """, (submission_id,))
                all_criteria = cursor.fetchall()

                cursor.execute("SELECT * FROM revaluation_requests WHERE submission_id = ? ORDER BY requested_at DESC", (submission_id,))
                reval_rows = [dict(r) for r in cursor.fetchall()]

                cursor.execute("SELECT * FROM audit_logs WHERE submission_id = ? ORDER BY created_at DESC", (submission_id,))
                audit_logs = [dict(log) for log in cursor.fetchall()]

        # Assembly in memory (zero DB latency)
        rubric_q_map = {q["question_id"]: q for q in rubric_data.get("questions", [])}
        regions_by_ans = {}
        for r in all_regions:
            rd = dict(r)
            regions_by_ans.setdefault(rd["answer_id"], []).append(rd)

        criteria_by_ans = {}
        for c in all_criteria:
            cd = dict(c)
            criteria_by_ans.setdefault(cd["answer_id"], []).append(cd)

        # Single directory stat check
        crops_dir = settings.RENDERS_DIR / submission_id / "crops"
        existing_crops = set()
        if crops_dir.is_dir():
            try:
                existing_crops = {f.name for f in crops_dir.iterdir() if f.is_file()}
            except Exception:
                pass

        answers = []
        for a_row in answers_raw:
            a = dict(a_row)
            q_info = rubric_q_map.get(a["question_id"], {})
            a["official_answer"] = q_info.get("official_answer", "")
            a["question_text"] = q_info.get("question_text", "")
            a["rubric_criteria"] = q_info.get("criteria", [])

            # Regions with per-region crop URLs
            ans_regs = regions_by_ans.get(a["id"], [])
            for r in ans_regs:
                reg_crop_name = f"crop_{a['id']}_{r['id']}.png"
                r["crop_url"] = f"/api/grading/crop/{submission_id}/{a['id']}?region_id={r['id']}" if reg_crop_name in existing_crops else None
            a["regions"] = ans_regs

            # Criterion scores
            a["criterion_scores"] = criteria_by_ans.get(a["id"], [])

            # Primary crop
            primary_crop_name = f"crop_{a['id']}.png"
            has_crop = primary_crop_name in existing_crops
            a["has_crop"] = has_crop
            a["crop_url"] = f"/api/grading/crop/{submission_id}/{a['id']}" if has_crop else None

            # Normalize flags
            a["needs_review"] = bool(a.get("needs_review"))
            a["is_missing"] = bool(a.get("is_missing"))
            a["is_manual_override"] = bool(a.get("is_manual_override"))
            a["is_extra_attempt"] = bool(a.get("is_extra_attempt"))

            # Revaluation matching
            qid = str(a.get("question_id") or "")
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
                a["revaluation"] = {
                    "id": matching_reval["id"],
                    "status": matching_reval["status"],
                    "decision": matching_reval.get("decision"),
                    "student_reason": matching_reval.get("student_reason"),
                    "reviewer_notes": matching_reval.get("reviewer_notes"),
                    "requested_at": matching_reval.get("requested_at"),
                    "resolved_at": matching_reval.get("resolved_at"),
                }
            else:
                a["revaluation"] = None

            answers.append(a)

        res["answers"] = answers
        res["revaluation_requests"] = reval_rows
        res["audit_logs"] = audit_logs
        res["is_manual_override"] = bool(res.get("is_manual_override"))
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
        Applies teacher correction, creates audit log, recalculates totals immediately.
        """
        now = get_iso_now()
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM answers WHERE id = ? AND submission_id = ?", (answer_id, submission_id))
            old_ans = cursor.fetchone()
            if not old_ans:
                raise ValueError("Answer record not found.")

            # Record audit logs for each changed field in batch
            audit_entries = []
            if edit_req.awarded_marks is not None and edit_req.awarded_marks != old_ans["awarded_marks"]:
                audit_entries.append((str(uuid.uuid4()), submission_id, answer_id, 'awarded_marks', str(old_ans["awarded_marks"]), str(edit_req.awarded_marks), edit_req.reason, 'teacher', now))

            if edit_req.extracted_text is not None and edit_req.extracted_text != old_ans["extracted_text"]:
                audit_entries.append((str(uuid.uuid4()), submission_id, answer_id, 'extracted_text', old_ans["extracted_text"], edit_req.extracted_text, edit_req.reason, 'teacher', now))

            if edit_req.grading_rationale is not None and edit_req.grading_rationale != old_ans["grading_rationale"]:
                audit_entries.append((str(uuid.uuid4()), submission_id, answer_id, 'grading_rationale', old_ans["grading_rationale"], edit_req.grading_rationale, edit_req.reason, 'teacher', now))

            if edit_req.question_id is not None and edit_req.question_id != old_ans["question_id"]:
                audit_entries.append((str(uuid.uuid4()), submission_id, answer_id, 'question_id', old_ans["question_id"], edit_req.question_id, edit_req.reason, 'teacher', now))

            if audit_entries:
                cursor.executemany("""
                INSERT INTO audit_logs (id, submission_id, answer_id, field_name, old_value, new_value, reason, edited_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, audit_entries)

            # Update answer
            new_awarded = old_ans["awarded_marks"] if edit_req.awarded_marks is None else edit_req.awarded_marks
            new_awarded = max(0.0, min(float(new_awarded), float(old_ans["max_marks"])))
            new_text = old_ans["extracted_text"] if edit_req.extracted_text is None else edit_req.extracted_text
            new_rationale = old_ans["grading_rationale"] if edit_req.grading_rationale is None else edit_req.grading_rationale
            new_qid = old_ans["question_id"] if edit_req.question_id is None else edit_req.question_id
            new_needs_review = old_ans["needs_review"] if edit_req.needs_review is None else (1 if edit_req.needs_review else 0)

            cursor.execute("""
            UPDATE answers
            SET awarded_marks = ?, extracted_text = ?, grading_rationale = ?,
                question_id = ?, needs_review = ?, is_manual_override = 1, updated_at = ?
            WHERE id = ?
            """, (new_awarded, new_text, new_rationale, new_qid, new_needs_review, now, answer_id))

            # Update criterion scores if supplied
            if edit_req.criterion_scores:
                crit_params = [
                    (c.awarded_marks, c.evidence, answer_id, c.criterion_id)
                    for c in edit_req.criterion_scores
                ]
                cursor.executemany("""
                UPDATE criterion_scores
                SET awarded_marks = ?, evidence = ?, is_manual_override = 1
                WHERE answer_id = ? AND criterion_id = ?
                """, crit_params)

            # Recalculate submission totals with Best-of-N and Section limits
            cursor.execute("""
            SELECT rubric_data FROM rubric_versions
            WHERE exam_id = (SELECT exam_id FROM submissions WHERE id = ?) AND is_approved = 1
            ORDER BY version_num DESC LIMIT 1
            """, (submission_id,))
            rub_r = cursor.fetchone()
            rubric_data = json.loads(rub_r["rubric_data"]) if rub_r and rub_r["rubric_data"] else {}

            tot_awarded, tot_max, pct, overall_needs_review = GradingService.apply_best_of_n_and_compute_totals(
                cursor, submission_id, rubric_data, now
            )

            cursor.execute("""
            UPDATE submissions
            SET total_awarded_marks = ?, max_marks = ?, percentage = ?, is_manual_override = 1,
                status = ?, reviewed_at = ?, updated_at = ?
            WHERE id = ?
            """, (tot_awarded, tot_max, pct, 'NEEDS_REVIEW' if overall_needs_review else 'COMPLETED', now, now, submission_id))

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
        Adjusts bounding box coordinates, writes audit log, updates crop & export PDF.
        """
        now = get_iso_now()
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM answer_regions WHERE id = ?", (region_id,))
            old_reg = cursor.fetchone()
            if not old_reg:
                cursor.execute("SELECT * FROM answer_regions WHERE answer_id = ? ORDER BY id ASC LIMIT 1", (region_id,))
                old_reg = cursor.fetchone()
            if not old_reg:
                raise ValueError("Region record not found.")

            actual_region_id = old_reg["id"]

            cursor.execute("""
            INSERT INTO audit_logs (id, submission_id, answer_id, field_name, old_value, new_value, reason, edited_by, created_at)
            VALUES (?, ?, ?, 'bounding_box', ?, ?, ?, 'teacher', ?)
            """, (
                str(uuid.uuid4()), submission_id, old_reg["answer_id"],
                f"[{old_reg['x']:.2f}, {old_reg['y']:.2f}, {old_reg['width']:.2f}, {old_reg['height']:.2f}]",
                f"[{edit_req.x:.2f}, {edit_req.y:.2f}, {edit_req.width:.2f}, {edit_req.height:.2f}]",
                edit_req.reason, now
            ))

            cursor.execute("""
            UPDATE answer_regions
            SET page_number = ?, x = ?, y = ?, width = ?, height = ?, is_manual_override = 1
            WHERE id = ?
            """, (edit_req.page_number, edit_req.x, edit_req.y, edit_req.width, edit_req.height, actual_region_id))

            cursor.execute("""
            UPDATE answers
            SET page_number = ?, updated_at = ?
            WHERE id = ?
            """, (edit_req.page_number, now, old_reg["answer_id"]))

            cursor.execute("""
            UPDATE submissions
            SET updated_at = ?
            WHERE id = ?
            """, (now, submission_id))

        # Re-crop answer image
        renders_dir = settings.RENDERS_DIR / submission_id
        crops_dir = renders_dir / "crops"
        crops_dir.mkdir(parents=True, exist_ok=True)
        page_img = renders_dir / f"page_{edit_req.page_number}.png"
        crop_path = crops_dir / f"crop_{old_reg['answer_id']}.png"
        reg_crop_path = crops_dir / f"crop_{old_reg['answer_id']}_{actual_region_id}.png"

        if not page_img.exists():
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT canonical_pdf_path, original_file_path FROM submissions WHERE id = ?", (submission_id,))
                sub = cursor.fetchone()
            if sub:
                key = sub.get("canonical_pdf_path") or sub.get("original_file_path")
                if key:
                    try:
                        storage = get_storage_service()
                        local_pdf = storage.get_local_path_or_download(key)
                        pdf_service.render_pdf_pages_to_images(local_pdf, submission_id)
                    except Exception:
                        pass

        if page_img.exists():
            pdf_service.crop_answer_region(page_img, edit_req.x, edit_req.y, edit_req.width, edit_req.height, crop_path)
            pdf_service.crop_answer_region(page_img, edit_req.x, edit_req.y, edit_req.width, edit_req.height, reg_crop_path)

        # Re-export annotated PDF asynchronously in background
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
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, exam_id, status FROM submissions WHERE id = ?", (submission_id,))
            sub = cursor.fetchone()
            if not sub:
                raise ValueError(f"Submission {submission_id} not found")

            # Fetch any answers that currently have needs_review = 1
            cursor.execute("""
            SELECT id, question_id, needs_review, review_reason
            FROM answers
            WHERE submission_id = ? AND needs_review = 1
            """, (submission_id,))
            flagged_answers = cursor.fetchall()

            audit_entries = [
                (str(uuid.uuid4()), submission_id, fa["id"], 'needs_review', '1', '0', 'Bulk unflagged from review', reviewer, now)
                for fa in flagged_answers
            ]
            if audit_entries:
                cursor.executemany("""
                INSERT INTO audit_logs (id, submission_id, answer_id, field_name, old_value, new_value, reason, edited_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, audit_entries)

            # Clear all needs_review flags on answers
            cursor.execute("""
            UPDATE answers
            SET needs_review = 0, review_reason = NULL, is_manual_override = 1, updated_at = ?
            WHERE submission_id = ?
            """, (now, submission_id))

            # Fetch rubric to recalculate totals
            cursor.execute("""
            SELECT rubric_data FROM rubric_versions
            WHERE exam_id = (SELECT exam_id FROM submissions WHERE id = ?) AND is_approved = 1
            ORDER BY version_num DESC LIMIT 1
            """, (submission_id,))
            rub_r = cursor.fetchone()
            rubric_data = json.loads(rub_r["rubric_data"]) if rub_r and rub_r["rubric_data"] else {}

            tot_awarded, tot_max, pct, overall_needs_review = GradingService.apply_best_of_n_and_compute_totals(
                cursor, submission_id, rubric_data, now
            )

            new_status = 'NEEDS_REVIEW' if overall_needs_review else 'COMPLETED'

            cursor.execute("""
            UPDATE submissions
            SET total_awarded_marks = ?, max_marks = ?, percentage = ?, is_manual_override = 1,
                status = ?, reviewed_at = ?, updated_at = ?
            WHERE id = ?
            """, (tot_awarded, tot_max, pct, new_status, now, now, submission_id))

        # Re-export annotated PDF asynchronously in background
        GradingService.trigger_background_export_pdf(submission_id)
        return GradingService.get_submission_details(submission_id)

    @staticmethod
    def bulk_clear_exam_reviews(exam_id: str, reviewer: str = "teacher") -> Dict[str, Any]:
        """
        Clears review flags for all submissions under an exam currently in NEEDS_REVIEW.
        """
        now = get_iso_now()
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            SELECT id FROM submissions
            WHERE exam_id = ? AND status = 'NEEDS_REVIEW'
            """, (exam_id,))
            flagged_subs = [r["id"] for r in cursor.fetchall()]

            # Fetch rubric once for the exam
            cursor.execute("""
            SELECT rubric_data FROM rubric_versions
            WHERE exam_id = ? AND is_approved = 1
            ORDER BY version_num DESC LIMIT 1
            """, (exam_id,))
            rub_r = cursor.fetchone()
            rubric_data = json.loads(rub_r["rubric_data"]) if rub_r and rub_r["rubric_data"] else {}

            cleared_count = 0
            for sub_id in flagged_subs:
                try:
                    cursor.execute("""
                    SELECT id FROM answers
                    WHERE submission_id = ? AND needs_review = 1
                    """, (sub_id,))
                    fas = cursor.fetchall()

                    audit_entries = [
                        (str(uuid.uuid4()), sub_id, fa["id"], 'needs_review', '1', '0', 'Bulk unflagged from review', reviewer, now)
                        for fa in fas
                    ]
                    if audit_entries:
                        cursor.executemany("""
                        INSERT INTO audit_logs (id, submission_id, answer_id, field_name, old_value, new_value, reason, edited_by, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, audit_entries)

                    cursor.execute("""
                    UPDATE answers
                    SET needs_review = 0, review_reason = NULL, is_manual_override = 1, updated_at = ?
                    WHERE submission_id = ?
                    """, (now, sub_id))

                    tot_awarded, tot_max, pct, overall_needs_review = GradingService.apply_best_of_n_and_compute_totals(
                        cursor, sub_id, rubric_data, now
                    )
                    new_status = 'NEEDS_REVIEW' if overall_needs_review else 'COMPLETED'
                    cursor.execute("""
                    UPDATE submissions
                    SET total_awarded_marks = ?, max_marks = ?, percentage = ?, is_manual_override = 1,
                        status = ?, reviewed_at = ?, updated_at = ?
                    WHERE id = ?
                    """, (tot_awarded, tot_max, pct, new_status, now, now, sub_id))

                    GradingService.trigger_background_export_pdf(sub_id)
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

