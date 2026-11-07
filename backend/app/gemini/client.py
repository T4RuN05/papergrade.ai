import time
import json
import random
import uuid
import threading
from typing import Optional, Dict, Any, Tuple, List
from pathlib import Path
from google import genai
from google.genai import types
from google.genai.errors import APIError

from backend.app.config import settings
from backend.app.db.session import get_session
from backend.app.db.base import get_iso_now
from backend.app.db.models import ApiUsageEvent
from backend.app.schemas import (
    ExamRubricExtractionResult,
    StudentGradingExtractionResult,
    RubricQuestion,
    RubricCriterion,
    GradedAnswerItem,
    AnswerRegionItem,
    CriterionScoreItem,
    BlindExtractedAnswerItem,
    Stage1BlindExtractionResult,
    Stage2EvaluatedQuestionItem,
    Stage2StudentEvaluationItem,
    Stage2BatchedGradingResult,
)
from backend.app.gemini.pricing import calculate_paid_equivalent_cost
from backend.app.gemini.prompts import (
    RUBRIC_EXTRACTION_SYSTEM_INSTRUCTION,
    STUDENT_GRADING_SYSTEM_INSTRUCTION,
    STAGE1_BLIND_EXTRACTION_SYSTEM_INSTRUCTION,
    STAGE2_BATCHED_GRADING_SYSTEM_INSTRUCTION,
    build_rubric_extraction_prompt,
    build_student_grading_prompt,
    build_stage1_blind_extraction_prompt,
    build_stage2_batched_grading_prompt,
)

def build_question_skeleton_from_rubric(rubric_dict: dict) -> str:
    """Strips official_answer, accepted_alternatives, and criteria so Stage 1 OCR is 100% blind."""
    skeleton_questions = []
    for idx, q in enumerate(rubric_dict.get("questions", [])):
        q_id = str(q.get("question_id", ""))
        sub_id = str(q.get("subquestion_id", "")) if q.get("subquestion_id") else None
        q_text = str(q.get("question_text", ""))
        notes = str(q.get("grading_notes", "")).lower()
        official = str(q.get("official_answer", ""))
        max_m = float(q.get("max_marks") or 1.0)

        # Detect objective/MCQ nature cleanly without leaking answer
        is_mcq = (
            "mcq" in notes
            or "option" in notes
            or "multiple choice" in q_text.lower()
            or (max_m == 1.0 and any(opt in official for opt in ["A)", "B)", "C)", "D)", "(A)", "(B)", "(C)", "(D)"]))
        )

        aliases = []
        clean_qid = q_id.lstrip("Qq").strip()
        parts = clean_qid.split(".")
        if len(parts) == 2:
            main_num, sub_num = parts[0], parts[1]
            try:
                sub_int = int(sub_num)
                roman_numerals = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]
                roman = roman_numerals[sub_int - 1] if 1 <= sub_int <= len(roman_numerals) else str(sub_int)
                alpha = chr(ord('a') + sub_int - 1) if 1 <= sub_int <= 26 else str(sub_int)
                aliases.extend([
                    f"{sub_num}", f"({sub_num})", f"{sub_num}.", f"{sub_num})",
                    f"({roman})", f"{roman})", f"{roman}.",
                    f"({alpha})", f"{alpha})",
                    f"Q{main_num}({sub_num})", f"Q{main_num}({roman})", f"Q{main_num}.{sub_num}",
                    f"Ans {sub_num}", f"Ans ({roman})"
                ])
            except ValueError:
                aliases.append(sub_num)
        elif sub_id:
            aliases.extend([f"({sub_id})", f"{sub_id})", f"{q_id}({sub_id})"])
        else:
            aliases.extend([f"{clean_qid}", f"Q{clean_qid}", f"Ans {clean_qid}"])

        skeleton_questions.append({
            "question_id": q_id,
            "subquestion_id": q.get("subquestion_id"),
            "section_id": q.get("section_id"),
            "question_text": q_text,
            "max_marks": q.get("max_marks"),
            "format": "MCQ_OBJECTIVE" if is_mcq else "DESCRIPTIVE_NUMERICAL",
            "student_numbering_aliases": aliases[:8],
        })

    return json.dumps({
        "exam_title": rubric_dict.get("exam_title"),
        "subject": rubric_dict.get("subject"),
        "sections": rubric_dict.get("sections", []),
        "questions": skeleton_questions,
    }, ensure_ascii=False)

def merge_stage1_and_stage2(
    stage1: Stage1BlindExtractionResult,
    stage2_student: Stage2StudentEvaluationItem,
    rubric_dict: Optional[Dict[str, Any]] = None,
) -> StudentGradingExtractionResult:
    """
    Combines Stage 1 Blind OCR (extracted text, page numbers, bounding boxes)
    with Stage 2 Evaluated Audit (criterion scores, rationale, marks)
    into a complete StudentGradingExtractionResult.
    """
    s2_lookup: Dict[Tuple[str, Optional[str]], Stage2EvaluatedQuestionItem] = {}
    for eq in stage2_student.evaluated_answers:
        s2_lookup[(eq.question_id, eq.subquestion_id)] = eq

    max_marks_lookup: Dict[Tuple[str, Optional[str]], float] = {}
    if rubric_dict:
        for q in rubric_dict.get("questions", []):
            max_marks_lookup[(q.get("question_id"), q.get("subquestion_id"))] = float(q.get("max_marks", 1.0))

    graded_answers: List[GradedAnswerItem] = []
    for a1 in stage1.answers:
        key = (a1.question_id, a1.subquestion_id)
        s2_item = s2_lookup.get(key)
        q_max_marks = max_marks_lookup.get(key, 0.0)

        if s2_item:
            crit_scores = s2_item.criterion_scores
            if not q_max_marks and crit_scores:
                q_max_marks = sum(c.max_marks for c in crit_scores)

            clamped_awarded = min(s2_item.awarded_marks, q_max_marks if q_max_marks > 0 else s2_item.awarded_marks)

            graded_answers.append(GradedAnswerItem(
                question_id=a1.question_id,
                subquestion_id=a1.subquestion_id,
                section_id=a1.section_id,
                page_number=a1.page_number,
                is_missing=a1.is_missing,
                extracted_student_answer=a1.extracted_student_answer,
                regions=a1.regions,
                max_marks=q_max_marks,
                criterion_scores=crit_scores,
                grading_rationale=s2_item.grading_rationale,
                awarded_marks=clamped_awarded,
                transcription_uncertainty=a1.transcription_uncertainty,
                grading_uncertainty=s2_item.grading_uncertainty,
                needs_review=s2_item.needs_review,
                review_reason=s2_item.review_reason,
            ))
        else:
            graded_answers.append(GradedAnswerItem(
                question_id=a1.question_id,
                subquestion_id=a1.subquestion_id,
                section_id=a1.section_id,
                page_number=a1.page_number,
                is_missing=a1.is_missing or True,
                extracted_student_answer=a1.extracted_student_answer,
                regions=a1.regions,
                max_marks=q_max_marks,
                criterion_scores=[],
                grading_rationale="Omitted or not evaluated by grading model.",
                awarded_marks=0.0,
                transcription_uncertainty=a1.transcription_uncertainty,
                grading_uncertainty=1.0,
                needs_review=True,
                review_reason="Unmatched question in Stage 2 evaluation",
            ))

    return StudentGradingExtractionResult(
        submission_identifier=stage2_student.submission_id or stage1.submission_identifier,
        student_name_detected=stage1.student_name_detected,
        roll_number_detected=stage1.roll_number_detected,
        answers=graded_answers,
    )

class AllGeminiKeysExhaustedError(RuntimeError):
    """Raised when all configured Gemini API keys have exhausted their quota / rate limits."""
    pass

def is_rate_or_quota_error(e: Exception) -> bool:
    code = getattr(e, "code", None)
    err_str = str(e).lower()
    if code in (429, 503):
        return True
    if "429" in err_str or "resource_exhausted" in err_str or "quota" in err_str:
        return True
    if "503" in err_str or "unavailable" in err_str or "high demand" in err_str:
        return True
    return False

class GeminiGradingClient:
    def __init__(self):
        self.model_name = settings.GEMINI_MODEL
        self.candidate_models: List[str] = [self.model_name]
        self._model_cooldown_until: Dict[str, float] = {}

        self._keys = settings.configured_api_keys
        self._current_key_idx = 0
        self._key_lock = threading.Lock()
        self._key_offsets: Dict[int, int] = {}
        self._clients: Dict[str, genai.Client] = {}
        for k in self._keys:
            try:
                self._clients[k] = genai.Client(api_key=k)
            except Exception as e:
                print(f"[GeminiClient] Error initializing client for key {k[:6]}...: {e}")

    def get_active_models(self) -> List[str]:
        now = time.time()
        active = [m for m in self.candidate_models if self._model_cooldown_until.get(m, 0) <= now]
        return active if active else self.candidate_models

    @property
    def is_live(self) -> bool:
        return len(self._clients) > 0

    @property
    def active_key_count(self) -> int:
        return len(self._keys)

    def get_current_client(self, worker_id: int = 0) -> Tuple[str, genai.Client]:
        if not self._keys:
            raise RuntimeError("No Gemini API keys configured.")
        with self._key_lock:
            offset = self._key_offsets.get(worker_id, 0)
            active_idx = (worker_id + offset) % len(self._keys)
            active_key = self._keys[active_idx]
            if active_key not in self._clients:
                self._clients[active_key] = genai.Client(api_key=active_key)
            return active_key, self._clients[active_key]

    def rotate_to_next_key(self, worker_id: int = 0, reason: str = "") -> str:
        if len(self._keys) <= 1:
            return self._keys[0] if self._keys else ""
        with self._key_lock:
            old_offset = self._key_offsets.get(worker_id, 0)
            self._key_offsets[worker_id] = old_offset + 1
            old_idx = (worker_id + old_offset) % len(self._keys)
            new_idx = (worker_id + old_offset + 1) % len(self._keys)
            new_key = self._keys[new_idx]
            masked_old = self._keys[old_idx][:6] + "..." + self._keys[old_idx][-4:]
            masked_new = new_key[:6] + "..." + new_key[-4:]
            print(f"[GeminiClient] Worker #{worker_id} key failover: #{old_idx + 1} ({masked_old}) -> #{new_idx + 1} ({masked_new}). Reason: {reason}")
            return new_key

    def mask_key(self, api_key: Optional[str]) -> str:
        if not api_key:
            return "default"
        try:
            key_idx = self._keys.index(api_key) + 1
        except ValueError:
            key_idx = "?"
        masked = f"{api_key[:6]}...{api_key[-4:]}" if len(api_key) > 10 else "***"
        return f"Key #{key_idx} ({masked})"

    def _record_usage_event(
        self,
        exam_id: Optional[str],
        batch_id: Optional[str],
        submission_id: Optional[str],
        request_purpose: str,
        duration_ms: int,
        success: bool,
        input_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
        total_tokens: Optional[int] = None,
        cached_tokens: Optional[int] = None,
        thinking_tokens: Optional[int] = None,
        page_count: Optional[int] = None,
        file_size_bytes: Optional[int] = None,
        http_status: Optional[int] = None,
        error_code: Optional[str] = None,
        retry_attempt: int = 0,
        is_mock: bool = False,
        model_name: Optional[str] = None,
        api_key: Optional[str] = None
    ) -> str:
        actual_model = model_name or self.model_name
        masked_key = self.mask_key(api_key) if api_key else "default"
        cost = calculate_paid_equivalent_cost(
            input_tokens=input_tokens or 0,
            output_tokens=output_tokens or 0,
            cached_tokens=cached_tokens or 0,
            thinking_tokens=thinking_tokens or 0,
            model_name=actual_model
        )
        event_id = str(uuid.uuid4())
        try:
            with get_session() as session:
                event = ApiUsageEvent(
                    id=event_id,
                    timestamp=get_iso_now(),
                    exam_id=exam_id,
                    batch_id=batch_id,
                    submission_id=submission_id,
                    request_purpose=request_purpose,
                    model_name=actual_model,
                    api_key_masked=masked_key,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=total_tokens,
                    thinking_tokens=thinking_tokens,
                    cached_tokens=cached_tokens,
                    duration_ms=duration_ms,
                    page_count=page_count,
                    file_size_bytes=file_size_bytes,
                    success=1 if success else 0,
                    http_status=http_status,
                    error_code=error_code,
                    retry_attempt=retry_attempt,
                    estimated_cost_usd=cost,
                    pricing_version=settings.PRICING_VERSION,
                    is_mock=1 if is_mock else 0
                )
                session.add(event)
                session.commit()
        except Exception as log_err:
            print(f"[GeminiClient] Warning: Could not record usage event to DB: {log_err}")

        # Console telemetry output for developer observability
        status_tag = f"status={http_status}" if http_status else ("SUCCESS" if success else "FAILED")
        print(f"[Telemetry] {actual_model} via {masked_key} | {request_purpose} | {status_tag} | {duration_ms}ms | tokens: in={input_tokens or 0}, out={output_tokens or 0}")
        return event_id

    def extract_exam_rubric(
        self,
        exam_id: str = "",
        question_paper_path: Optional[Path] = None,
        answer_key_path: Optional[Path] = None,
        extra_notes: str = "",
        *,
        question_paper_pdf: Optional[Path] = None,
        answer_key_pdf: Optional[Path] = None,
        subject: Optional[str] = None,
        **kwargs: Any
    ) -> Tuple[ExamRubricExtractionResult, str]:
        """
        Extracts structured rubric definition from question paper and answer key.
        Supports both canonical Path arguments and keyword aliases.
        """
        exam_id = exam_id or kwargs.get("exam_id", "")
        ak_p = answer_key_path or answer_key_pdf or kwargs.get("answer_key_pdf")
        qp_p = question_paper_path or question_paper_pdf or kwargs.get("question_paper_pdf") or ak_p
        
        if ak_p is None:
            raise ValueError("An answer key PDF path must be provided.")
        if not ak_p.exists():
            raise FileNotFoundError(f"Answer key not found: {ak_p}")
        if qp_p is None or not qp_p.exists():
            qp_p = ak_p

        notes = extra_notes
        if subject:
            notes = f"Subject: {subject}. {notes}".strip()

        qp_bytes = qp_p.read_bytes()
        ak_bytes = ak_p.read_bytes()
        file_size = len(qp_bytes) + len(ak_bytes)

        if not self.is_live:
            # Fallback mock rubric for development/testing when no API key is provided
            time.sleep(0.5)
            mock_result = ExamRubricExtractionResult(
                exam_title="Physics & Mechanics Midterm (Mock)",
                subject="Physics",
                total_marks=20.0,
                questions=[
                    RubricQuestion(
                        question_id="Q1",
                        question_text="State Newton's Second Law of Motion and write its mathematical equation.",
                        max_marks=4.0,
                        official_answer="Newton's second law states that the rate of change of momentum is directly proportional to applied force. Equation: F = ma.",
                        accepted_alternatives=["F = dp/dt"],
                        criteria=[
                            RubricCriterion(criterion_id="C1", description="Clear statement of Second Law", marks=2.0),
                            RubricCriterion(criterion_id="C2", description="Correct mathematical equation (F=ma or F=dp/dt)", marks=2.0)
                        ],
                        grading_notes="Full marks if principle and formula are both provided."
                    ),
                    RubricQuestion(
                        question_id="Q2",
                        question_text="A 1500 kg automobile accelerates uniformly from rest to 20 m/s in 10 s. Calculate the net force acting on it.",
                        max_marks=6.0,
                        official_answer="Acceleration a = (20 - 0)/10 = 2 m/s^2. Net force F = m*a = 1500 * 2 = 3000 N.",
                        accepted_alternatives=["Using impulse formula F*t = m*v -> F = 15000 * 20 / 10 = 3000 N"],
                        criteria=[
                            RubricCriterion(criterion_id="C1", description="Calculated acceleration a = 2 m/s^2", marks=2.0),
                            RubricCriterion(criterion_id="C2", description="Substituted into F = ma", marks=2.0),
                            RubricCriterion(criterion_id="C3", description="Correct final answer with units (3000 N)", marks=2.0)
                        ],
                        numerical_tolerances="+/- 1% with unit N required",
                        grading_notes="Deduct 1 mark if unit is missing."
                    ),
                    RubricQuestion(
                        question_id="Q3",
                        question_text="Define work and calculate work done when a force of 50 N moves a box 6 m along a frictionless floor.",
                        max_marks=5.0,
                        official_answer="Work is force times displacement in direction of force (W = F * d). W = 50 N * 6 m = 300 Joules.",
                        criteria=[
                            RubricCriterion(criterion_id="C1", description="Definition or formula W = F * d", marks=2.0),
                            RubricCriterion(criterion_id="C2", description="Calculation and answer 300 J with units", marks=3.0)
                        ]
                    ),
                    RubricQuestion(
                        question_id="Q4",
                        question_text="Differentiate between kinetic energy and potential energy with one example each.",
                        max_marks=5.0,
                        official_answer="Kinetic energy is energy possessed by virtue of motion (e.g. rolling ball). Potential energy is energy stored due to position/configuration (e.g. stretched bow).",
                        criteria=[
                            RubricCriterion(criterion_id="C1", description="Definition & example of kinetic energy", marks=2.5),
                            RubricCriterion(criterion_id="C2", description="Definition & example of potential energy", marks=2.5)
                        ]
                    )
                ]
            )
            event_id = self._record_usage_event(
                exam_id=exam_id, batch_id=None, submission_id=None,
                request_purpose="EXAM_SETUP", duration_ms=450, success=True,
                input_tokens=1820, output_tokens=420, total_tokens=2240,
                file_size_bytes=file_size, is_mock=True
            )
            return mock_result, event_id

        # Live Gemini execution with multi-key failover and model fallback
        num_keys = max(1, len(self._keys))
        max_retries = max(4, num_keys * 2)
        backoff_sec = 2.0
        prompt_text = build_rubric_extraction_prompt(extra_notes)
        models_to_try = self.get_active_models()
        last_error = None

        for model_to_use in models_to_try:
            exhausted_keys = set()
            for attempt in range(max_retries):
                start_time = time.time()
                active_key, client = self.get_current_client()
                try:
                    contents = [
                        types.Part.from_bytes(data=qp_bytes, mime_type="application/pdf"),
                        types.Part.from_bytes(data=ak_bytes, mime_type="application/pdf"),
                        prompt_text
                    ]
                    config = types.GenerateContentConfig(
                        system_instruction=RUBRIC_EXTRACTION_SYSTEM_INSTRUCTION,
                        response_mime_type="application/json",
                        response_schema=ExamRubricExtractionResult,
                        temperature=0.1,
                        max_output_tokens=65536
                    )
                    response = client.models.generate_content(
                        model=model_to_use,
                        contents=contents,
                        config=config
                    )
                    duration_ms = int((time.time() - start_time) * 1000)

                    # Validate JSON before recording success
                    raw_text = response.text or ""
                    try:
                        parsed = ExamRubricExtractionResult.model_validate_json(raw_text)
                    except Exception as parse_err:
                        repaired = self._repair_truncated_json(raw_text)
                        if repaired:
                            parsed = ExamRubricExtractionResult.model_validate_json(repaired)
                        else:
                            raise parse_err

                    # Token usage
                    in_tok = response.usage_metadata.prompt_token_count if response.usage_metadata else None
                    out_tok = response.usage_metadata.candidates_token_count if response.usage_metadata else None
                    tot_tok = response.usage_metadata.total_token_count if response.usage_metadata else None
                    cached_tok = response.usage_metadata.cached_content_token_count if response.usage_metadata else None

                    event_id = self._record_usage_event(
                        exam_id=exam_id, batch_id=None, submission_id=None,
                        request_purpose="EXAM_SETUP", duration_ms=duration_ms, success=True,
                        input_tokens=in_tok, output_tokens=out_tok, total_tokens=tot_tok,
                        cached_tokens=cached_tok, file_size_bytes=file_size,
                        retry_attempt=attempt, is_mock=False, model_name=model_to_use,
                        api_key=active_key
                    )
                    return parsed, event_id

                except Exception as e:
                    last_error = e
                    duration_ms = int((time.time() - start_time) * 1000)
                    err_code = type(e).__name__
                    http_status = getattr(e, "code", 500) if hasattr(e, "code") else 500

                    self._record_usage_event(
                        exam_id=exam_id, batch_id=None, submission_id=None,
                        request_purpose="EXAM_SETUP", duration_ms=duration_ms, success=False,
                        file_size_bytes=file_size, http_status=http_status,
                        error_code=f"{err_code}: {str(e)[:150]}", retry_attempt=attempt,
                        is_mock=False, model_name=model_to_use, api_key=active_key
                    )

                    if is_rate_or_quota_error(e):
                        exhausted_keys.add(active_key)
                        if len(exhausted_keys) >= len(self._keys):
                            print(f"[GeminiClient] Quota exhausted on all {len(self._keys)} keys for model '{model_to_use}'. Cooldown for 30m; attempting next model.")
                            self._model_cooldown_until[model_to_use] = time.time() + 1800
                            break
                        self.rotate_to_next_key(reason=f"Rate limit / unavailability: {e}")
                        time.sleep(1.0)
                        continue

                    if attempt == max_retries - 1:
                        print(f"[GeminiClient] Non-quota error on model '{model_to_use}' after {max_retries} attempts: {e}. Trying fallback model.")
                        break

                    sleep_time = backoff_sec * (1.5 ** attempt) + random.uniform(0.1, 0.5)
                    time.sleep(sleep_time)

        if last_error and not is_rate_or_quota_error(last_error):
            raise last_error

        raise AllGeminiKeysExhaustedError(
            f"All {len(self._keys)} Gemini API keys have exhausted quota across candidate models {models_to_try}: {last_error}"
        )

    @staticmethod
    def _repair_truncated_json(raw_text: str) -> Optional[str]:
        """
        Attempts to gracefully repair slightly truncated JSON from LLM generation
        by closing open strings, brackets, and braces.
        """
        if not raw_text or not raw_text.strip():
            return None
        text = raw_text.strip()
        # If wrapped in markdown code fence, strip it
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        # Count unbalanced structures
        in_string = False
        escape = False
        stack = []
        for char in text:
            if escape:
                escape = False
                continue
            if char == "\\":
                escape = True
                continue
            if char == '"':
                in_string = not in_string
                continue
            if not in_string:
                if char in ('{', '['):
                    stack.append(char)
                elif char == '}':
                    if stack and stack[-1] == '{':
                        stack.pop()
                elif char == ']':
                    if stack and stack[-1] == '[':
                        stack.pop()

        repaired = text
        if in_string:
            repaired += '"'

        while stack:
            opener = stack.pop()
            if opener == '{':
                repaired += '}'
            elif opener == '[':
                repaired += ']'

        try:
            json.loads(repaired)
            return repaired
        except Exception:
            return None

    def extract_student_submission_blind(
        self,
        exam_id: str,
        submission_id: str,
        student_pdf_path: Path,
        rubric_dict: Dict[str, Any],
        page_count: int = 1,
        worker_id: int = 0
    ) -> Tuple[Stage1BlindExtractionResult, str]:
        """
        Stage 1: Blind Forensic OCR & BBox Localization (gemini-3.5-flash-lite | 2,000 RPD Pool).
        Input: Student PDF bytes + stripped Question Skeleton JSON (no official_answer, no criteria).
        Output: Verbatim student transcription + normalized [0.0, 1.0] bounding boxes.
        """
        pdf_bytes = student_pdf_path.read_bytes()
        file_size = len(pdf_bytes)

        if not self.is_live:
            skeleton = json.loads(build_question_skeleton_from_rubric(rubric_dict))
            mock_answers = []
            for q in skeleton.get("questions", []):
                mock_answers.append(BlindExtractedAnswerItem(
                    question_id=q["question_id"],
                    subquestion_id=q.get("subquestion_id"),
                    section_id=q.get("section_id"),
                    page_number=1,
                    is_missing=False,
                    extracted_student_answer="Mock handwritten answer for " + q["question_id"],
                    regions=[AnswerRegionItem(page_number=1, x=0.1, y=0.1, width=0.8, height=0.2)],
                    transcription_uncertainty=0.05
                ))
            mock_res = Stage1BlindExtractionResult(
                submission_identifier=submission_id,
                student_name_detected="Student Name",
                roll_number_detected="C25-001",
                answers=mock_answers
            )
            event_id = self._record_usage_event(
                exam_id=exam_id, batch_id=None, submission_id=submission_id,
                request_purpose="STAGE1_BLIND_OCR", duration_ms=400, success=True,
                page_count=page_count, file_size_bytes=file_size, is_mock=True,
                model_name=settings.GEMINI_EXTRACTION_MODEL
            )
            return mock_res, event_id

        skeleton_json_str = build_question_skeleton_from_rubric(rubric_dict)
        prompt_text = build_stage1_blind_extraction_prompt(skeleton_json_str)

        extraction_models = [settings.GEMINI_EXTRACTION_MODEL]
        if "flash-lite" not in settings.GEMINI_EXTRACTION_MODEL:
            extraction_models.append("gemini-3.5-flash-lite")

        now_ts = time.time()
        active_extraction_models = [m for m in extraction_models if self._model_cooldown_until.get(m, 0) <= now_ts]
        models_to_try = active_extraction_models if active_extraction_models else extraction_models

        num_keys = max(1, len(self._keys))
        max_retries = max(4, num_keys * 2)
        backoff_sec = 2.0
        last_error = None

        for model_to_use in models_to_try:
            exhausted_keys = set()
            for attempt in range(max_retries):
                start_time = time.time()
                active_key, client = self.get_current_client(worker_id=worker_id)
                try:
                    contents = [
                        types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                        prompt_text
                    ]
                    config = types.GenerateContentConfig(
                        system_instruction=STAGE1_BLIND_EXTRACTION_SYSTEM_INSTRUCTION,
                        response_mime_type="application/json",
                        response_schema=Stage1BlindExtractionResult,
                        temperature=0.0,
                        max_output_tokens=32768,
                        thinking_config=types.ThinkingConfig(thinking_budget=2048)
                    )
                    response = client.models.generate_content(
                        model=model_to_use,
                        contents=contents,
                        config=config
                    )
                    duration_ms = int((time.time() - start_time) * 1000)

                    raw_text = response.text or ""
                    try:
                        parsed = Stage1BlindExtractionResult.model_validate_json(raw_text)
                    except Exception as parse_err:
                        repaired = self._repair_truncated_json(raw_text)
                        if repaired:
                            parsed = Stage1BlindExtractionResult.model_validate_json(repaired)
                        else:
                            raise parse_err

                    in_tok = response.usage_metadata.prompt_token_count if response.usage_metadata else None
                    out_tok = response.usage_metadata.candidates_token_count if response.usage_metadata else None
                    tot_tok = response.usage_metadata.total_token_count if response.usage_metadata else None
                    cached_tok = response.usage_metadata.cached_content_token_count if response.usage_metadata else None
                    thk_tok = getattr(response.usage_metadata, "thoughts_token_count", None) if response.usage_metadata else None
                    if thk_tok is None and tot_tok is not None and in_tok is not None and out_tok is not None:
                        inferred = tot_tok - (in_tok + out_tok)
                        thk_tok = inferred if inferred > 0 else 0

                    event_id = self._record_usage_event(
                        exam_id=exam_id, batch_id=None, submission_id=submission_id,
                        request_purpose="STAGE1_BLIND_OCR", duration_ms=duration_ms, success=True,
                        input_tokens=in_tok, output_tokens=out_tok, total_tokens=tot_tok,
                        thinking_tokens=thk_tok, cached_tokens=cached_tok, page_count=page_count,
                        file_size_bytes=file_size, retry_attempt=attempt, is_mock=False,
                        model_name=model_to_use, api_key=active_key
                    )
                    return parsed, event_id

                except Exception as e:
                    last_error = e
                    duration_ms = int((time.time() - start_time) * 1000)
                    err_code = type(e).__name__
                    http_status = getattr(e, "code", 500) if hasattr(e, "code") else 500

                    self._record_usage_event(
                        exam_id=exam_id, batch_id=None, submission_id=submission_id,
                        request_purpose="STAGE1_BLIND_OCR", duration_ms=duration_ms, success=False,
                        page_count=page_count, file_size_bytes=file_size, http_status=http_status,
                        error_code=f"{err_code}: {str(e)[:150]}", retry_attempt=attempt,
                        is_mock=False, model_name=model_to_use, api_key=active_key
                    )

                    if is_rate_or_quota_error(e):
                        exhausted_keys.add(active_key)
                        if len(exhausted_keys) >= len(self._keys):
                            print(f"[GeminiClient Stage1] All {len(self._keys)} keys exhausted quota for model '{model_to_use}'. Cooldown for 30m; attempting next model.")
                            self._model_cooldown_until[model_to_use] = time.time() + 1800
                            break
                        self.rotate_to_next_key(worker_id=worker_id, reason=f"Stage 1 rate limit: {e}")
                        time.sleep(0.5)
                        continue

                    if attempt == max_retries - 1:
                        print(f"[GeminiClient Stage1] Non-quota error on '{model_to_use}': {e}. Trying next model.")
                        break

                    time.sleep(backoff_sec * (1.5 ** attempt) + random.uniform(0.1, 0.5))

        if last_error and not is_rate_or_quota_error(last_error):
            raise last_error

        raise AllGeminiKeysExhaustedError(
            f"Stage 1 OCR: All {len(self._keys)} keys exhausted quota for {extraction_models}: {last_error}"
        )

    def grade_extracted_batch(
        self,
        exam_id: str,
        rubric_dict: Dict[str, Any],
        batch_payloads: List[Dict[str, Any]],
        worker_id: int = 0
    ) -> Tuple[Stage2BatchedGradingResult, str]:
        """
        Stage 2: Multi-Student Batched Rubric Evaluation (gemini-3.8-flash -> gemini-3.5-flash | 80-160 RPD Pool).
        Input: Full Rubric + list of up to GRADING_BATCH_SIZE (4) student Stage-1 transcripts.
        Output: Stage2BatchedGradingResult evaluated in ONE single API call (4x RPD multiplier!).
        RESTRICTION: NEVER use gemini-3.5-flash-lite or gemini-flash-lite-latest in this cascade.
        """
        if not self.is_live:
            mock_results = []
            for b in batch_payloads:
                sub_id = b["submission_id"]
                ev_answers = []
                for ans in b.get("answers", []):
                    qid = ans["question_id"]
                    sub_qid = ans.get("subquestion_id")
                    ev_answers.append(Stage2EvaluatedQuestionItem(
                        question_id=qid,
                        subquestion_id=sub_qid,
                        criterion_scores=[CriterionScoreItem(
                            criterion_id="C1",
                            description="Criterion 1",
                            max_marks=1.0,
                            evidence='PASS | QUOTE: "Mock answer" | CHECK: verified',
                            awarded_marks=1.0
                        )],
                        grading_rationale="Mock evaluation passed.",
                        awarded_marks=1.0,
                        grading_uncertainty=0.02,
                        needs_review=False
                    ))
                mock_results.append(Stage2StudentEvaluationItem(
                    submission_id=sub_id,
                    evaluated_answers=ev_answers
                ))
            mock_res = Stage2BatchedGradingResult(results=mock_results)
            event_id = self._record_usage_event(
                exam_id=exam_id, batch_id=None, submission_id=None,
                request_purpose="STAGE2_BATCH_GRADE", duration_ms=600, success=True,
                is_mock=True, model_name=settings.GEMINI_GRADING_MODEL
            )
            return mock_res, event_id

        rubric_str = json.dumps(rubric_dict, indent=2)
        batch_str = json.dumps(batch_payloads, indent=2)
        prompt_text = build_stage2_batched_grading_prompt(rubric_str, batch_str)

        # STRICT INVARIANT: High-reasoning models only (NEVER flash-lite!)
        raw_grading_models = [
            settings.GEMINI_GRADING_MODEL,
            settings.GEMINI_GRADING_FALLBACK_MODEL,
            getattr(settings, "GEMINI_GRADING_FALLBACK_MODEL_2", "gemini-3.5-flash"),
        ]
        now_ts = time.time()
        grading_models = []
        for m in raw_grading_models:
            if m and "lite" not in m.lower() and m not in grading_models:
                if self._model_cooldown_until.get(m, 0) <= now_ts:
                    grading_models.append(m)

        if not grading_models:
            grading_models = [m for m in raw_grading_models if m and "lite" not in m.lower()]

        if not grading_models:
            grading_models = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash"]

        num_keys = max(1, len(self._keys))
        max_retries = max(4, num_keys * 2)
        backoff_sec = 2.0
        last_error = None

        for model_to_use in grading_models:
            exhausted_keys = set()
            for attempt in range(max_retries):
                start_time = time.time()
                active_key, client = self.get_current_client(worker_id=worker_id)
                try:
                    thinking_cfg = None
                    if getattr(settings, "GEMINI_THINKING_BUDGET", None) is not None:
                        thinking_cfg = types.ThinkingConfig(thinking_budget=settings.GEMINI_THINKING_BUDGET)

                    config = types.GenerateContentConfig(
                        system_instruction=STAGE2_BATCHED_GRADING_SYSTEM_INSTRUCTION,
                        response_mime_type="application/json",
                        response_schema=Stage2BatchedGradingResult,
                        temperature=0.0,
                        max_output_tokens=65536,
                        thinking_config=thinking_cfg
                    )
                    response = client.models.generate_content(
                        model=model_to_use,
                        contents=[prompt_text],
                        config=config
                    )
                    duration_ms = int((time.time() - start_time) * 1000)

                    raw_text = response.text or ""
                    try:
                        parsed = Stage2BatchedGradingResult.model_validate_json(raw_text)
                    except Exception as parse_err:
                        repaired = self._repair_truncated_json(raw_text)
                        if repaired:
                            parsed = Stage2BatchedGradingResult.model_validate_json(repaired)
                        else:
                            raise parse_err

                    in_tok = response.usage_metadata.prompt_token_count if response.usage_metadata else None
                    out_tok = response.usage_metadata.candidates_token_count if response.usage_metadata else None
                    tot_tok = response.usage_metadata.total_token_count if response.usage_metadata else None
                    cached_tok = response.usage_metadata.cached_content_token_count if response.usage_metadata else None
                    thk_tok = getattr(response.usage_metadata, "thoughts_token_count", None) if response.usage_metadata else None
                    if thk_tok is None and tot_tok is not None and in_tok is not None and out_tok is not None:
                        inferred = tot_tok - (in_tok + out_tok)
                        thk_tok = inferred if inferred > 0 else 0

                    event_id = self._record_usage_event(
                        exam_id=exam_id, batch_id=None, submission_id=None,
                        request_purpose="STAGE2_BATCH_GRADE", duration_ms=duration_ms, success=True,
                        input_tokens=in_tok, output_tokens=out_tok, total_tokens=tot_tok,
                        thinking_tokens=thk_tok, cached_tokens=cached_tok, retry_attempt=attempt,
                        is_mock=False, model_name=model_to_use, api_key=active_key
                    )
                    return parsed, event_id

                except Exception as e:
                    last_error = e
                    duration_ms = int((time.time() - start_time) * 1000)
                    err_code = type(e).__name__
                    http_status = getattr(e, "code", 500) if hasattr(e, "code") else 500

                    self._record_usage_event(
                        exam_id=exam_id, batch_id=None, submission_id=None,
                        request_purpose="STAGE2_BATCH_GRADE", duration_ms=duration_ms, success=False,
                        http_status=http_status, error_code=f"{err_code}: {str(e)[:150]}",
                        retry_attempt=attempt, is_mock=False, model_name=model_to_use, api_key=active_key
                    )

                    if is_rate_or_quota_error(e):
                        exhausted_keys.add(active_key)
                        if len(exhausted_keys) >= len(self._keys):
                            print(f"[GeminiClient Stage2] All {len(self._keys)} keys exhausted quota for model '{model_to_use}'. Cooldown for 30m; falling back to next model.")
                            self._model_cooldown_until[model_to_use] = time.time() + 1800
                            break
                        self.rotate_to_next_key(worker_id=worker_id, reason=f"Stage 2 rate limit: {e}")
                        time.sleep(0.5)
                        continue

                    if attempt == max_retries - 1:
                        print(f"[GeminiClient Stage2] Non-quota error on '{model_to_use}': {e}. Trying next model.")
                        break

                    time.sleep(backoff_sec * (1.5 ** attempt) + random.uniform(0.1, 0.5))

        if last_error and not is_rate_or_quota_error(last_error):
            raise last_error

        raise AllGeminiKeysExhaustedError(
            f"Stage 2 Batched Grading: All {len(self._keys)} keys exhausted quota for {grading_models}: {last_error}"
        )

    def grade_student_submission(
        self,
        exam_id: str,
        batch_id: Optional[str],
        submission_id: str,
        student_pdf_path: Path,
        rubric_json: Dict[str, Any],
        page_count: int,
        worker_id: int = 0
    ) -> Tuple[StudentGradingExtractionResult, str]:
        """
        Primary experimental grading pass:
        Performs transcription, mapping, localization, grading, and explanation in ONE request.
        """
        pdf_bytes = student_pdf_path.read_bytes()
        file_size = len(pdf_bytes)

        if not self.is_live:
            # High-fidelity mock response for UI development and unit testing
            time.sleep(0.6)
            mock_answers = []
            questions = rubric_json.get("questions", [])

            for idx, q in enumerate(questions):
                qid = q.get("question_id", f"Q{idx+1}")
                max_m = float(q.get("max_marks", 4.0))
                criteria = q.get("criteria", [])

                # Create realistic variation across questions
                if idx == 0:
                    # Full marks answer
                    crit_scores = [
                        CriterionScoreItem(
                            criterion_id=c.get("criterion_id", "C1"),
                            description=c.get("description", ""),
                            max_marks=float(c.get("marks", 2.0)),
                            awarded_marks=float(c.get("marks", 2.0)),
                            evidence="Student wrote: 'Newton's second law: Rate of change of momentum is proportional to applied force. F = ma.'"
                        ) for c in criteria
                    ]
                    awarded = sum(c.awarded_marks for c in crit_scores) or max_m
                    mock_answers.append(GradedAnswerItem(
                        question_id=qid,
                        page_number=1,
                        extracted_student_answer="Newton's 2nd law states that the rate of change of momentum of a body is directly proportional to the applied force. Equation: F = m * a.",
                        regions=[AnswerRegionItem(page_number=1, x=0.08, y=0.12, width=0.84, height=0.18)],
                        max_marks=max_m,
                        awarded_marks=awarded,
                        criterion_scores=crit_scores,
                        grading_rationale="Both statement and formula are clearly articulated. Full marks awarded.",
                        transcription_uncertainty=0.05,
                        grading_uncertainty=0.02,
                        needs_review=False
                    ))
                elif idx == 1:
                    # Partial marks answer with units error
                    crit_scores = []
                    for c_idx, c in enumerate(criteria):
                        c_max = float(c.get("marks", 2.0))
                        c_awarded = c_max if c_idx < len(criteria) - 1 else 1.0
                        evid = "Found acceleration a = 2 m/s^2, F = 3000 but omitted unit N" if c_idx == len(criteria) - 1 else "Correct step demonstrated."
                        crit_scores.append(CriterionScoreItem(
                            criterion_id=c.get("criterion_id", f"C{c_idx+1}"),
                            description=c.get("description", ""),
                            max_marks=c_max,
                            awarded_marks=c_awarded,
                            evidence=evid
                        ))
                    awarded = sum(c.awarded_marks for c in crit_scores)
                    mock_answers.append(GradedAnswerItem(
                        question_id=qid,
                        page_number=1,
                        extracted_student_answer="a = (v - u)/t = (20 - 0)/10 = 2 m/s^2.\nF = m * a = 1500 * 2 = 3000.",
                        regions=[AnswerRegionItem(page_number=1, x=0.08, y=0.34, width=0.84, height=0.22)],
                        max_marks=max_m,
                        awarded_marks=awarded,
                        criterion_scores=crit_scores,
                        grading_rationale="Acceleration and numerical calculation are correct, but the unit of force (Newton) was omitted. 1 mark deducted as per rubric.",
                        transcription_uncertainty=0.12,
                        grading_uncertainty=0.15,
                        needs_review=True,
                        review_reason="Borderline unit deduction: teacher confirmation advised"
                    ))
                elif idx == 2:
                    # Multi-region answer
                    crit_scores = [
                        CriterionScoreItem(
                            criterion_id=c.get("criterion_id", "C1"),
                            description=c.get("description", ""),
                            max_marks=float(c.get("marks", 2.5)),
                            awarded_marks=float(c.get("marks", 2.5)),
                            evidence="Provided definition: W = F * d = 50 * 6 = 300 Joules."
                        ) for c in criteria
                    ]
                    awarded = sum(c.awarded_marks for c in crit_scores) or max_m
                    mock_answers.append(GradedAnswerItem(
                        question_id=qid,
                        page_number=min(2, page_count),
                        extracted_student_answer="Work is defined as force multiplied by displacement in direction of force. W = 50 N * 6 m = 300 J.",
                        regions=[
                            AnswerRegionItem(page_number=min(2, page_count), x=0.08, y=0.10, width=0.84, height=0.14),
                            AnswerRegionItem(page_number=min(2, page_count), x=0.08, y=0.26, width=0.84, height=0.12)
                        ],
                        max_marks=max_m,
                        awarded_marks=awarded,
                        criterion_scores=crit_scores,
                        grading_rationale="Work definition and calculation are exact. Full marks awarded.",
                        transcription_uncertainty=0.08,
                        grading_uncertainty=0.04,
                        needs_review=False
                    ))
                else:
                    # Missing answer
                    mock_answers.append(GradedAnswerItem(
                        question_id=qid,
                        page_number=min(2, page_count),
                        extracted_student_answer="",
                        regions=[],
                        max_marks=max_m,
                        awarded_marks=0.0,
                        criterion_scores=[],
                        grading_rationale="No attempted solution found on any page.",
                        transcription_uncertainty=0.0,
                        grading_uncertainty=0.0,
                        needs_review=True,
                        review_reason="Question was not attempted by student",
                        is_missing=True
                    ))

            mock_result = StudentGradingExtractionResult(
                submission_identifier=submission_id,
                student_name_detected="Aarav Sharma",
                roll_number_detected="ROLL-101",
                answers=mock_answers
            )
            event_id = self._record_usage_event(
                exam_id=exam_id, batch_id=batch_id, submission_id=submission_id,
                request_purpose="SUBMISSION_GRADING", duration_ms=850, success=True,
                input_tokens=2450, output_tokens=680, total_tokens=3130,
                page_count=page_count, file_size_bytes=file_size, is_mock=True
            )
            return mock_result, event_id

        # If Two-Stage Pipeline is enabled, delegate to decoupled Stage 1 (Blind OCR) + Stage 2 (Audit)
        if getattr(settings, "ENABLE_TWO_STAGE_PIPELINE", True):
            s1_res, _ = self.extract_student_submission_blind(
                exam_id=exam_id,
                submission_id=submission_id,
                student_pdf_path=student_pdf_path,
                rubric_dict=rubric_json,
                page_count=page_count,
                worker_id=worker_id
            )
            batch_payload = [{
                "submission_id": submission_id,
                "answers": [
                    {
                        "question_id": a.question_id,
                        "subquestion_id": a.subquestion_id,
                        "extracted_student_answer": a.extracted_student_answer,
                        "is_missing": a.is_missing,
                    }
                    for a in s1_res.answers
                ]
            }]
            s2_res, event_id = self.grade_extracted_batch(
                exam_id=exam_id,
                rubric_dict=rubric_json,
                batch_payloads=batch_payload,
                worker_id=worker_id
            )
            s2_student = s2_res.results[0] if s2_res.results else Stage2StudentEvaluationItem(submission_id=submission_id, evaluated_answers=[])
            merged = merge_stage1_and_stage2(s1_res, s2_student, rubric_dict=rubric_json)
            return merged, event_id

        # Real Gemini multimodal grading request with multi-key failover and model fallback
        num_keys = max(1, len(self._keys))
        max_retries = max(4, num_keys * 2)
        backoff_sec = 2.0
        rubric_str = json.dumps(rubric_json, indent=2)
        prompt_text = build_student_grading_prompt(rubric_str)
        models_to_try = self.get_active_models()
        last_error = None

        for model_to_use in models_to_try:
            exhausted_keys = set()
            for attempt in range(max_retries):
                start_time = time.time()
                active_key, client = self.get_current_client(worker_id=worker_id)
                try:
                    contents = [
                        types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                        prompt_text
                    ]
                    thinking_cfg = None
                    if getattr(settings, "GEMINI_THINKING_BUDGET", None) is not None:
                        thinking_cfg = types.ThinkingConfig(thinking_budget=settings.GEMINI_THINKING_BUDGET)

                    config = types.GenerateContentConfig(
                        system_instruction=STUDENT_GRADING_SYSTEM_INSTRUCTION,
                        response_mime_type="application/json",
                        response_schema=StudentGradingExtractionResult,
                        temperature=0.1,
                        max_output_tokens=65536,
                        thinking_config=thinking_cfg
                    )
                    response = client.models.generate_content(
                        model=model_to_use,
                        contents=contents,
                        config=config
                    )
                    duration_ms = int((time.time() - start_time) * 1000)

                    # Validate JSON before recording success
                    raw_text = response.text or ""
                    try:
                        parsed = StudentGradingExtractionResult.model_validate_json(raw_text)
                    except Exception as parse_err:
                        repaired = self._repair_truncated_json(raw_text)
                        if repaired:
                            parsed = StudentGradingExtractionResult.model_validate_json(repaired)
                        else:
                            raise parse_err

                    in_tok = response.usage_metadata.prompt_token_count if response.usage_metadata else None
                    out_tok = response.usage_metadata.candidates_token_count if response.usage_metadata else None
                    tot_tok = response.usage_metadata.total_token_count if response.usage_metadata else None
                    cached_tok = response.usage_metadata.cached_content_token_count if response.usage_metadata else None
                    thk_tok = getattr(response.usage_metadata, "thoughts_token_count", None) if response.usage_metadata else None
                    if thk_tok is None and tot_tok is not None and in_tok is not None and out_tok is not None:
                        inferred = tot_tok - (in_tok + out_tok)
                        thk_tok = inferred if inferred > 0 else 0

                    event_id = self._record_usage_event(
                        exam_id=exam_id, batch_id=batch_id, submission_id=submission_id,
                        request_purpose="SUBMISSION_GRADING", duration_ms=duration_ms, success=True,
                        input_tokens=in_tok, output_tokens=out_tok, total_tokens=tot_tok,
                        thinking_tokens=thk_tok, cached_tokens=cached_tok, page_count=page_count,
                        file_size_bytes=file_size, retry_attempt=attempt, is_mock=False,
                        model_name=model_to_use, api_key=active_key
                    )
                    return parsed, event_id

                except Exception as e:
                    last_error = e
                    duration_ms = int((time.time() - start_time) * 1000)
                    err_code = type(e).__name__
                    http_status = getattr(e, "code", 500) if hasattr(e, "code") else 500

                    self._record_usage_event(
                        exam_id=exam_id, batch_id=batch_id, submission_id=submission_id,
                        request_purpose="SUBMISSION_GRADING", duration_ms=duration_ms, success=False,
                        page_count=page_count, file_size_bytes=file_size, http_status=http_status,
                        error_code=f"{err_code}: {str(e)[:150]}", retry_attempt=attempt,
                        is_mock=False, model_name=model_to_use, api_key=active_key
                    )

                    if is_rate_or_quota_error(e):
                        exhausted_keys.add(active_key)
                        if len(exhausted_keys) >= len(self._keys):
                            print(f"[GeminiClient] All {len(self._keys)} keys hit rate limits for '{model_to_use}'. Pausing 5s for RPM window reset.")
                            time.sleep(5.0)
                            exhausted_keys.clear()
                        self.rotate_to_next_key(worker_id=worker_id, reason=f"Rate limit / unavailability: {e}")
                        time.sleep(1.0)
                        continue

                    if attempt == max_retries - 1:
                        print(f"[GeminiClient] Non-quota error on model '{model_to_use}' after {max_retries} attempts: {e}. Trying fallback model.")
                        break

                    sleep_time = backoff_sec * (1.5 ** attempt) + random.uniform(0.1, 0.5)
                    time.sleep(sleep_time)

        if last_error and not is_rate_or_quota_error(last_error):
            raise last_error

        raise AllGeminiKeysExhaustedError(
            f"All {len(self._keys)} Gemini API keys have exhausted quota across candidate models {models_to_try}: {last_error}"
        )

gemini_client = GeminiGradingClient()
