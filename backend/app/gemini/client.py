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
    CriterionScoreItem
)
from backend.app.gemini.pricing import calculate_paid_equivalent_cost
from backend.app.gemini.prompts import (
    RUBRIC_EXTRACTION_SYSTEM_INSTRUCTION,
    STUDENT_GRADING_SYSTEM_INSTRUCTION,
    build_rubric_extraction_prompt,
    build_student_grading_prompt
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
        candidates = [self.model_name, "gemini-2.5-flash-lite"]
        self.candidate_models: List[str] = []
        for m in candidates:
            if m and m not in self.candidate_models:
                self.candidate_models.append(m)
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
        model_name: Optional[str] = None
    ) -> str:
        actual_model = model_name or self.model_name
        cost = calculate_paid_equivalent_cost(
            input_tokens=input_tokens or 0,
            output_tokens=output_tokens or 0,
            cached_tokens=cached_tokens or 0,
            thinking_tokens=thinking_tokens or 0,
            model_name=actual_model
        )
        event_id = str(uuid.uuid4())
        with get_session() as session:
            event = ApiUsageEvent(
                id=event_id,
                timestamp=get_iso_now(),
                exam_id=exam_id,
                batch_id=batch_id,
                submission_id=submission_id,
                request_purpose=request_purpose,
                model_name=actual_model,
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
                        retry_attempt=attempt, is_mock=False, model_name=model_to_use
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
                        is_mock=False, model_name=model_to_use
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
                        model_name=model_to_use
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
                        is_mock=False, model_name=model_to_use
                    )

                    if is_rate_or_quota_error(e):
                        exhausted_keys.add(active_key)
                        if len(exhausted_keys) >= len(self._keys):
                            print(f"[GeminiClient] Quota exhausted on all {len(self._keys)} keys for model '{model_to_use}'. Cooldown for 30m; attempting next model.")
                            self._model_cooldown_until[model_to_use] = time.time() + 1800
                            break
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
