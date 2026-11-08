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
    SingleAnswerReevaluationResult,
)
from backend.app.gemini.pricing import calculate_paid_equivalent_cost
from backend.app.gemini.prompts import (
    RUBRIC_EXTRACTION_SYSTEM_INSTRUCTION,
    STUDENT_GRADING_SYSTEM_INSTRUCTION,
    SECONDARY_REEVALUATION_SYSTEM_INSTRUCTION,
    build_rubric_extraction_prompt,
    build_student_grading_prompt,
    build_secondary_reevaluation_prompt,
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
        # Canonical Flash Cascade: 3.8 Flash -> 3.6 Flash -> 3.5 Flash
        primary = settings.GEMINI_MODEL if ("lite" not in settings.GEMINI_MODEL.lower() and "1.5" not in settings.GEMINI_MODEL) else "gemini-3.8-flash"
        fallback_1 = getattr(settings, "GEMINI_FALLBACK_MODEL_1", "gemini-3.6-flash")
        fallback_2 = getattr(settings, "GEMINI_FALLBACK_MODEL_2", "gemini-3.5-flash")
        raw_cascade = [primary, fallback_1, fallback_2, "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash"]
        # Strictly ban any -lite or 1.5 models
        self.candidate_models: List[str] = list(
            dict.fromkeys(m for m in raw_cascade if m and "lite" not in m.lower() and "1.5" not in m)
        )
        if not self.candidate_models:
            self.candidate_models = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash"]
        self.model_name = self.candidate_models[0]
        self._model_cooldown_until: Dict[str, float] = {}
        self._key_cooldown_until: Dict[Tuple[str, str], float] = {}

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
        with self._key_lock:
            active = [m for m in self.candidate_models if self._model_cooldown_until.get(m, 0) <= now]
            return active if active else self.candidate_models

    def mark_key_exhausted_for_model(self, api_key: str, model_name: str, cooldown_seconds: float = 120.0):
        with self._key_lock:
            self._key_cooldown_until[(api_key, model_name)] = time.time() + cooldown_seconds

    def mark_model_cooldown(self, model_name: str, cooldown_seconds: float = 180.0):
        with self._key_lock:
            self._model_cooldown_until[model_name] = time.time() + cooldown_seconds
            print(f"[GeminiClient] Model '{model_name}' placed on cooldown for {int(cooldown_seconds)}s across all keys.")

    def clear_model_cooldown(self, model_name: str, api_key: Optional[str] = None):
        with self._key_lock:
            self._model_cooldown_until.pop(model_name, None)
            if api_key:
                self._key_cooldown_until.pop((api_key, model_name), None)

    @property
    def is_live(self) -> bool:
        return len(self._clients) > 0

    @property
    def active_key_count(self) -> int:
        return len(self._keys)

    def get_current_client(self, worker_id: int = 0, model_name: Optional[str] = None) -> Tuple[str, genai.Client]:
        if not self._keys:
            raise RuntimeError("No Gemini API keys configured.")
        with self._key_lock:
            offset = self._key_offsets.get(worker_id, 0)
            now = time.time()
            chosen_idx = (worker_id + offset) % len(self._keys)

            if model_name:
                for step in range(len(self._keys)):
                    idx = (worker_id + offset + step) % len(self._keys)
                    k = self._keys[idx]
                    if self._key_cooldown_until.get((k, model_name), 0) <= now:
                        chosen_idx = idx
                        self._key_offsets[worker_id] = (idx - worker_id) % len(self._keys)
                        break

            active_key = self._keys[chosen_idx]
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
            if "Round-robin" not in reason:
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
        max_attempts = max(2, num_keys)
        backoff_sec = 2.0
        prompt_text = build_rubric_extraction_prompt(extra_notes)
        models_to_try = self.get_active_models()
        last_error = None

        for model_to_use in models_to_try:
            exhausted_keys = set()
            for attempt in range(max_attempts):
                start_time = time.time()
                active_key, client = self.get_current_client(worker_id=0, model_name=model_to_use)
                if active_key in exhausted_keys:
                    self.rotate_to_next_key(worker_id=0, reason=f"Key already tried for {model_to_use}")
                    active_key, client = self.get_current_client(worker_id=0, model_name=model_to_use)

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

                    in_tok = response.usage_metadata.prompt_token_count if response.usage_metadata else None
                    out_tok = response.usage_metadata.candidates_token_count if response.usage_metadata else None
                    tot_tok = response.usage_metadata.total_token_count if response.usage_metadata else None
                    cached_tok = response.usage_metadata.cached_content_token_count if response.usage_metadata else None

                    event_id = self._record_usage_event(
                        exam_id=exam_id, batch_id=None, submission_id=None,
                        request_purpose="EXAM_SETUP", duration_ms=duration_ms, success=True,
                        input_tokens=in_tok, output_tokens=out_tok, total_tokens=tot_tok,
                        cached_tokens=cached_tok, page_count=None, file_size_bytes=file_size,
                        retry_attempt=attempt, is_mock=False, model_name=model_to_use, api_key=active_key
                    )
                    self.clear_model_cooldown(model_to_use, active_key)
                    self.rotate_to_next_key(worker_id=0, reason="Round-robin post-success")
                    return parsed, event_id

                except Exception as e:
                    last_error = e
                    duration_ms = int((time.time() - start_time) * 1000)
                    err_code = type(e).__name__
                    http_status = getattr(e, "code", 500) if hasattr(e, "code") else 500

                    self._record_usage_event(
                        exam_id=exam_id, batch_id=None, submission_id=None,
                        request_purpose="EXAM_SETUP", duration_ms=duration_ms, success=False,
                        page_count=None, file_size_bytes=file_size, http_status=http_status,
                        error_code=f"{err_code}: {str(e)[:150]}", retry_attempt=attempt,
                        is_mock=False, model_name=model_to_use, api_key=active_key
                    )

                    if is_rate_or_quota_error(e):
                        exhausted_keys.add(active_key)
                        self.mark_key_exhausted_for_model(active_key, model_to_use, cooldown_seconds=120.0)
                        if len(exhausted_keys) >= len(self._keys):
                            print(
                                f"[GeminiClient] All {len(self._keys)} keys hit quota limits for '{model_to_use}'. "
                                f"Placing '{model_to_use}' on 180s cooldown and falling back to next candidate model."
                            )
                            self.mark_model_cooldown(model_to_use, cooldown_seconds=180.0)
                            break
                        self.rotate_to_next_key(worker_id=0, reason=f"Rate limit / unavailability: {e}")
                        time.sleep(0.5)
                        continue

                    if attempt == max_attempts - 1:
                        print(f"[GeminiClient] Non-quota error on model '{model_to_use}' after {max_attempts} attempts: {e}. Trying fallback model.")
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
        """Repairs incomplete JSON caused by token cutoff by closing unclosed brackets/braces."""
        if not raw_text or not raw_text.strip():
            return None
        text = raw_text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines).strip()

        stack = []
        in_string = False
        escape_next = False
        for ch in text:
            if escape_next:
                escape_next = False
                continue
            if ch == '\\' and in_string:
                escape_next = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if not in_string:
                if ch in ('{', '['):
                    stack.append(ch)
                elif ch in ('}', ']'):
                    if stack:
                        stack.pop()

        if not stack and not in_string:
            return text

        repaired = text
        if in_string:
            repaired += '"'
        repaired = repaired.rstrip(", \n\r\t")
        for open_ch in reversed(stack):
            if open_ch == '{':
                repaired += '}'
            elif open_ch == '[':
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
        Single-Pass Multimodal Architecture:
        Evaluates student script PDF directly against approved rubric in ONE request.
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
                crit_scores = [
                    CriterionScoreItem(
                        criterion_id=c.get("criterion_id", "C1"),
                        description=c.get("description", ""),
                        max_marks=float(c.get("marks", 2.0)),
                        awarded_marks=float(c.get("marks", 2.0)),
                        evidence="PASS | QUOTE: \"Newton's second law: F = ma.\""
                    ) for c in criteria
                ]
                awarded = sum(c.awarded_marks for c in crit_scores) or max_m
                mock_answers.append(GradedAnswerItem(
                    question_id=qid,
                    page_number=1,
                    extracted_student_answer="Newton's 2nd law states that F = m * a.",
                    regions=[AnswerRegionItem(page_number=1, x=0.08, y=0.12, width=0.84, height=0.18)],
                    max_marks=max_m,
                    criterion_scores=crit_scores,
                    grading_rationale="Statement and formula provided. Full marks awarded.",
                    awarded_marks=awarded,
                    transcription_uncertainty=0.05,
                    grading_uncertainty=0.02,
                    needs_review=False
                ))

            mock_result = StudentGradingExtractionResult(
                submission_identifier=submission_id,
                student_name_detected="Aarav Sharma",
                roll_number_detected="ROLL-101",
                answers=mock_answers
            )
            event_id = self._record_usage_event(
                exam_id=exam_id, batch_id=batch_id, submission_id=submission_id,
                request_purpose="STUDENT_GRADING", duration_ms=850, success=True,
                input_tokens=2450, output_tokens=680, total_tokens=3130,
                page_count=page_count, file_size_bytes=file_size, is_mock=True
            )
            return mock_result, event_id

        # Minified JSON without whitespace tokens to save ~1,000 tokens
        rubric_str = json.dumps(rubric_json, separators=(",", ":"), ensure_ascii=False)
        prompt_text = build_student_grading_prompt(rubric_str)

        num_keys = max(1, len(self._keys))
        max_attempts = max(2, num_keys)
        backoff_sec = 2.0
        models_to_try = self.get_active_models()
        last_error = None

        for model_to_use in models_to_try:
            exhausted_keys = set()
            for attempt in range(max_attempts):
                start_time = time.time()
                active_key, client = self.get_current_client(worker_id=worker_id, model_name=model_to_use)
                if active_key in exhausted_keys:
                    self.rotate_to_next_key(worker_id=worker_id, reason=f"Key already tried for {model_to_use}")
                    active_key, client = self.get_current_client(worker_id=worker_id, model_name=model_to_use)
                try:
                    contents = [
                        types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                        prompt_text
                    ]
                    config = types.GenerateContentConfig(
                        system_instruction=STUDENT_GRADING_SYSTEM_INSTRUCTION,
                        temperature=0.0,
                        max_output_tokens=65536,
                        thinking_config=types.ThinkingConfig(thinking_budget=settings.GEMINI_THINKING_BUDGET),
                        response_mime_type="application/json",
                        response_schema=StudentGradingExtractionResult,
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
                        request_purpose="STUDENT_GRADING", duration_ms=duration_ms, success=True,
                        input_tokens=in_tok, output_tokens=out_tok, total_tokens=tot_tok,
                        thinking_tokens=thk_tok, cached_tokens=cached_tok, page_count=page_count,
                        file_size_bytes=file_size, retry_attempt=attempt, is_mock=False,
                        model_name=model_to_use, api_key=active_key
                    )
                    self.clear_model_cooldown(model_to_use, active_key)
                    self.rotate_to_next_key(worker_id=worker_id, reason="Round-robin post-success")
                    return parsed, event_id

                except Exception as e:
                    last_error = e
                    duration_ms = int((time.time() - start_time) * 1000)
                    err_code = type(e).__name__
                    http_status = getattr(e, "code", 500) if hasattr(e, "code") else 500

                    self._record_usage_event(
                        exam_id=exam_id, batch_id=batch_id, submission_id=submission_id,
                        request_purpose="STUDENT_GRADING", duration_ms=duration_ms, success=False,
                        page_count=page_count, file_size_bytes=file_size, http_status=http_status,
                        error_code=f"{err_code}: {str(e)[:150]}", retry_attempt=attempt,
                        is_mock=False, model_name=model_to_use, api_key=active_key
                    )

                    if is_rate_or_quota_error(e):
                        exhausted_keys.add(active_key)
                        self.mark_key_exhausted_for_model(active_key, model_to_use, cooldown_seconds=120.0)
                        if len(exhausted_keys) >= len(self._keys):
                            print(
                                f"[GeminiClient] All {len(self._keys)} keys hit quota limits for '{model_to_use}'. "
                                f"Placing '{model_to_use}' on 180s cooldown and falling back to next candidate model."
                            )
                            self.mark_model_cooldown(model_to_use, cooldown_seconds=180.0)
                            break
                        self.rotate_to_next_key(worker_id=worker_id, reason=f"Rate limit / unavailability: {e}")
                        time.sleep(0.5)
                        continue

                    if attempt == max_attempts - 1:
                        print(f"[GeminiClient] Non-quota error on model '{model_to_use}' after {max_attempts} attempts: {e}. Trying fallback model.")
                        break

                    sleep_time = backoff_sec * (1.5 ** attempt) + random.uniform(0.1, 0.5)
                    time.sleep(sleep_time)

        if last_error and not is_rate_or_quota_error(last_error):
            raise last_error

        raise AllGeminiKeysExhaustedError(
            f"All {len(self._keys)} Gemini API keys have exhausted quota across candidate models {models_to_try}: {last_error}"
        )

    def reevaluate_single_answer(
        self,
        crop_image_bytes: bytes,
        crop_mime_type: str,
        question_id: str,
        question_text: str,
        official_solution: str,
        max_marks: float,
        criteria: List[Dict[str, Any]],
        previous_extracted_text: str,
        previous_awarded_marks: float,
        previous_rationale: str,
        teacher_prompt: str = "",
        exam_id: Optional[str] = None,
        submission_id: Optional[str] = None,
        answer_id: Optional[str] = None,
        file_size: Optional[int] = None,
        worker_id: int = 0
    ) -> Tuple[SingleAnswerReevaluationResult, str]:
        """
        Targeted secondary evaluation of a single cropped answer region using Gemini 3.5 Flash Lite.
        Rotates through the 22-key pool with automatic 429 cooldowns and fallback.
        """
        if not self.is_live:
            # Fallback mock for offline dev mode
            mock_crit = []
            total_m = 0.0
            for c in criteria:
                cid = c.get("criterion_id", "C1")
                mm = float(c.get("max_marks", 1.0))
                mock_crit.append({
                    "criterion_id": cid,
                    "evidence": f'PASS | QUOTE: "{previous_extracted_text[:40]}"' if previous_extracted_text else "PASS",
                    "awarded_marks": mm,
                })
                total_m += mm
            total_m = min(total_m, max_marks)
            mock_res = SingleAnswerReevaluationResult(
                refined_student_text=previous_extracted_text or "Sample student response",
                criteria_scores=mock_crit,
                total_awarded_marks=total_m,
                updated_rationale=f"Offline mock re-evaluation with teacher guidance: {teacher_prompt or 'None'}",
                adjustment_summary=f"Re-evaluated via mock: awarded {total_m}/{max_marks} marks."
            )
            event_id = self._record_usage_event(
                exam_id=exam_id, batch_id=None, submission_id=submission_id,
                request_purpose="SECONDARY_REEVALUATION", duration_ms=250, success=True,
                input_tokens=450, output_tokens=180, total_tokens=630,
                page_count=1, file_size_bytes=file_size, is_mock=True
            )
            return mock_res, event_id

        prompt_text = build_secondary_reevaluation_prompt(
            question_id=question_id,
            question_text=question_text,
            official_solution=official_solution,
            max_marks=max_marks,
            criteria=criteria,
            previous_extracted_text=previous_extracted_text,
            previous_awarded_marks=previous_awarded_marks,
            previous_rationale=previous_rationale,
            teacher_prompt=teacher_prompt
        )

        primary_model = getattr(settings, "GEMINI_REEVAL_MODEL", "gemini-3.5-flash-lite")
        fallback_model = getattr(settings, "GEMINI_REEVAL_FALLBACK", "gemini-3.5-flash")
        candidate_models = list(dict.fromkeys([primary_model, fallback_model, "gemini-3.5-flash", "gemini-3.6-flash"]))

        now = time.time()
        active_models = [m for m in candidate_models if self._model_cooldown_until.get(m, 0) <= now]
        models_to_try = active_models if active_models else candidate_models

        num_keys = max(1, len(self._keys))
        max_attempts = max(2, num_keys)
        backoff_sec = 1.0
        last_error = None

        for model_to_use in models_to_try:
            exhausted_keys = set()
            for attempt in range(max_attempts):
                start_time = time.time()
                active_key, client = self.get_current_client(worker_id=worker_id, model_name=model_to_use)
                if active_key in exhausted_keys:
                    self.rotate_to_next_key(worker_id=worker_id, reason=f"Key already tried for {model_to_use}")
                    active_key, client = self.get_current_client(worker_id=worker_id, model_name=model_to_use)

                try:
                    contents = [
                        types.Part.from_bytes(data=crop_image_bytes, mime_type=crop_mime_type),
                        prompt_text
                    ]
                    config = types.GenerateContentConfig(
                        system_instruction=SECONDARY_REEVALUATION_SYSTEM_INSTRUCTION,
                        temperature=0.1,
                        max_output_tokens=8192,
                        response_mime_type="application/json",
                        response_schema=SingleAnswerReevaluationResult,
                    )
                    response = client.models.generate_content(
                        model=model_to_use,
                        contents=contents,
                        config=config
                    )
                    duration_ms = int((time.time() - start_time) * 1000)

                    raw_text = response.text or ""
                    try:
                        parsed = SingleAnswerReevaluationResult.model_validate_json(raw_text)
                    except Exception as parse_err:
                        repaired = self._repair_truncated_json(raw_text)
                        if repaired:
                            parsed = SingleAnswerReevaluationResult.model_validate_json(repaired)
                        else:
                            raise parse_err

                    in_tok = response.usage_metadata.prompt_token_count if response.usage_metadata else None
                    out_tok = response.usage_metadata.candidates_token_count if response.usage_metadata else None
                    tot_tok = response.usage_metadata.total_token_count if response.usage_metadata else None
                    cached_tok = response.usage_metadata.cached_content_token_count if response.usage_metadata else None

                    event_id = self._record_usage_event(
                        exam_id=exam_id, batch_id=None, submission_id=submission_id,
                        request_purpose="SECONDARY_REEVALUATION", duration_ms=duration_ms, success=True,
                        input_tokens=in_tok, output_tokens=out_tok, total_tokens=tot_tok,
                        cached_tokens=cached_tok, page_count=1, file_size_bytes=file_size,
                        retry_attempt=attempt, is_mock=False, model_name=model_to_use, api_key=active_key
                    )
                    self.clear_model_cooldown(model_to_use, active_key)
                    self.rotate_to_next_key(worker_id=worker_id, reason="Round-robin post-success")
                    return parsed, event_id

                except Exception as e:
                    last_error = e
                    duration_ms = int((time.time() - start_time) * 1000)
                    err_code = type(e).__name__
                    http_status = getattr(e, "code", 500) if hasattr(e, "code") else 500

                    self._record_usage_event(
                        exam_id=exam_id, batch_id=None, submission_id=submission_id,
                        request_purpose="SECONDARY_REEVALUATION", duration_ms=duration_ms, success=False,
                        page_count=1, file_size_bytes=file_size, http_status=http_status,
                        error_code=f"{err_code}: {str(e)[:150]}", retry_attempt=attempt,
                        is_mock=False, model_name=model_to_use, api_key=active_key
                    )

                    if is_rate_or_quota_error(e):
                        exhausted_keys.add(active_key)
                        self.mark_key_exhausted_for_model(active_key, model_to_use, cooldown_seconds=120.0)
                        if len(exhausted_keys) >= len(self._keys):
                            print(
                                f"[GeminiClient] All {len(self._keys)} keys hit quota limits for '{model_to_use}'. "
                                f"Placing '{model_to_use}' on 180s cooldown and falling back to next candidate model."
                            )
                            self.mark_model_cooldown(model_to_use, cooldown_seconds=180.0)
                            break
                        self.rotate_to_next_key(worker_id=worker_id, reason=f"Rate limit / unavailability: {e}")
                        time.sleep(0.5)
                        continue

                    if attempt == max_attempts - 1:
                        print(f"[GeminiClient] Non-quota error on model '{model_to_use}' after {max_attempts} attempts: {e}. Trying fallback model.")
                        break

                    sleep_time = backoff_sec * (1.5 ** attempt) + random.uniform(0.1, 0.4)
                    time.sleep(sleep_time)

        if last_error and not is_rate_or_quota_error(last_error):
            raise last_error

        raise AllGeminiKeysExhaustedError(
            f"All {len(self._keys)} Gemini API keys have exhausted quota across candidate models {models_to_try}: {last_error}"
        )


gemini_client = GeminiGradingClient()
