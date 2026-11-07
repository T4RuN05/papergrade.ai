import math
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, update

from backend.app.config import settings
from backend.app.db.session import get_session
from backend.app.db.base import get_iso_now
from backend.app.db.models import UserQuotaSetting, ApiUsageEvent
from backend.app.schemas import QuotaSettingsUpdateRequest


class UsageService:
    @staticmethod
    def get_quota_settings() -> Dict[str, Any]:
        with get_session() as session:
            setting = session.scalar(select(UserQuotaSetting).where(UserQuotaSetting.id == 'default'))
            if setting:
                return {
                    "id": setting.id,
                    "rpm_limit": setting.rpm_limit,
                    "tpm_limit": setting.tpm_limit,
                    "rpd_limit": setting.rpd_limit,
                    "updated_at": setting.updated_at,
                }
            return {
                "id": "default",
                "rpm_limit": settings.DEFAULT_RPM_LIMIT,
                "tpm_limit": settings.DEFAULT_TPM_LIMIT,
                "rpd_limit": settings.DEFAULT_RPD_LIMIT,
                "updated_at": get_iso_now()
            }

    @staticmethod
    def update_quota_settings(update_data: QuotaSettingsUpdateRequest) -> Dict[str, Any]:
        now = get_iso_now()
        with get_session() as session:
            setting = session.scalar(select(UserQuotaSetting).where(UserQuotaSetting.id == 'default'))
            if not setting:
                setting = UserQuotaSetting(
                    id='default',
                    rpm_limit=update_data.rpm_limit,
                    tpm_limit=update_data.tpm_limit,
                    rpd_limit=update_data.rpd_limit,
                    updated_at=now,
                )
                session.add(setting)
            else:
                setting.rpm_limit = update_data.rpm_limit
                setting.tpm_limit = update_data.tpm_limit
                setting.rpd_limit = update_data.rpd_limit
                setting.updated_at = now
            session.commit()
        return UsageService.get_quota_settings()

    @staticmethod
    def get_usage_metrics(exam_id: Optional[str] = None, batch_id: Optional[str] = None) -> Dict[str, Any]:
        with get_session() as session:
            stmt = select(ApiUsageEvent)
            if exam_id:
                stmt = stmt.where(ApiUsageEvent.exam_id == exam_id)
            if batch_id:
                stmt = stmt.where(ApiUsageEvent.batch_id == batch_id)
            stmt = stmt.order_by(ApiUsageEvent.timestamp.desc())

            event_objs = session.scalars(stmt).all()

        events = [
            {
                "id": e.id,
                "timestamp": e.timestamp,
                "exam_id": e.exam_id,
                "batch_id": e.batch_id,
                "submission_id": e.submission_id,
                "request_purpose": e.request_purpose,
                "model_name": e.model_name,
                "api_key_masked": getattr(e, "api_key_masked", None),
                "input_tokens": e.input_tokens,
                "output_tokens": e.output_tokens,
                "total_tokens": e.total_tokens,
                "thinking_tokens": e.thinking_tokens,
                "cached_tokens": e.cached_tokens,
                "duration_ms": e.duration_ms,
                "page_count": e.page_count,
                "file_size_bytes": e.file_size_bytes,
                "success": e.success,
                "http_status": e.http_status,
                "error_code": e.error_code,
                "retry_attempt": e.retry_attempt,
                "estimated_cost_usd": e.estimated_cost_usd,
                "pricing_version": e.pricing_version,
                "is_mock": e.is_mock,
            }
            for e in event_objs
        ]

        total_requests = len(events)
        if total_requests == 0:
            return UsageService._get_empty_metrics()

        successful = [e for e in events if e["success"] == 1]
        failed = [e for e in events if e["success"] == 0]
        retries = [e for e in events if e["retry_attempt"] > 0]
        grading_events = [
            e for e in events
            if e["request_purpose"] in ("SUBMISSION_GRADING", "STAGE2_BATCH_GRADE", "STAGE1_BLIND_OCR") and e["success"] == 1
        ]
        setup_events = [e for e in events if e["request_purpose"] == "EXAM_SETUP"]

        durations = sorted([e["duration_ms"] for e in events if e["duration_ms"] is not None])
        input_tokens = [e["input_tokens"] for e in grading_events if e["input_tokens"] is not None]
        output_tokens = [e["output_tokens"] for e in grading_events if e["output_tokens"] is not None]
        total_tokens = [e["total_tokens"] for e in grading_events if e["total_tokens"] is not None]
        costs = [e["estimated_cost_usd"] for e in grading_events if e["estimated_cost_usd"] is not None]

        avg_duration = sum(durations) / len(durations) if durations else 0
        median_duration = UsageService._percentile(durations, 50) if durations else 0
        p95_duration = UsageService._percentile(durations, 95) if durations else 0

        avg_in_tokens = sum(input_tokens) / len(input_tokens) if input_tokens else 2400
        median_in_tokens = UsageService._percentile(input_tokens, 50) if input_tokens else 2400
        p90_in_tokens = UsageService._percentile(input_tokens, 90) if input_tokens else avg_in_tokens * 1.3

        avg_out_tokens = sum(output_tokens) / len(output_tokens) if output_tokens else 650
        median_out_tokens = UsageService._percentile(output_tokens, 50) if output_tokens else 650
        p90_out_tokens = UsageService._percentile(output_tokens, 90) if output_tokens else avg_out_tokens * 1.3

        avg_tot_tokens = sum(total_tokens) / len(total_tokens) if total_tokens else avg_in_tokens + avg_out_tokens
        median_tot_tokens = UsageService._percentile(total_tokens, 50) if total_tokens else avg_tot_tokens
        p90_tot_tokens = UsageService._percentile(total_tokens, 90) if total_tokens else avg_tot_tokens * 1.3

        avg_cost = sum(costs) / len(costs) if costs else 0.00038
        p90_cost = max(avg_cost, UsageService._percentile(costs, 90) if costs else avg_cost * 1.3)
        total_spent = sum(e["estimated_cost_usd"] or 0.0 for e in events)

        retry_rate = (len(retries) / total_requests) * 100 if total_requests > 0 else 0.0
        failure_rate = (len(failed) / total_requests) * 100 if total_requests > 0 else 0.0

        quotas = UsageService.get_quota_settings()
        rpm = quotas["rpm_limit"]
        tpm = quotas["tpm_limit"]
        rpd = quotas["rpd_limit"]

        projections_40 = UsageService._calculate_batch_projection(
            batch_size=40,
            avg_in_tok=avg_in_tokens,
            avg_out_tok=avg_out_tokens,
            avg_tot_tok=avg_tot_tokens,
            avg_cost=avg_cost,
            p90_in_tok=p90_in_tokens,
            p90_out_tok=p90_out_tokens,
            p90_tot_tok=p90_tot_tokens,
            p90_cost=p90_cost,
            retry_rate_pct=retry_rate,
            rpm=rpm,
            tpm=tpm,
            rpd=rpd
        )

        projections_50 = UsageService._calculate_batch_projection(
            batch_size=50,
            avg_in_tok=avg_in_tokens,
            avg_out_tok=avg_out_tokens,
            avg_tot_tok=avg_tot_tokens,
            avg_cost=avg_cost,
            p90_in_tok=p90_in_tokens,
            p90_out_tok=p90_out_tokens,
            p90_tot_tok=p90_tot_tokens,
            p90_cost=p90_cost,
            retry_rate_pct=retry_rate,
            rpm=rpm,
            tpm=tpm,
            rpd=rpd
        )

        return {
            "summary": {
                "total_requests": total_requests,
                "successful_requests": len(successful),
                "failed_requests": len(failed),
                "retry_count": len(retries),
                "retry_rate_pct": round(retry_rate, 2),
                "failure_rate_pct": round(failure_rate, 2),
                "total_estimated_cost_usd": round(total_spent, 6),
                "pricing_version": settings.PRICING_VERSION
            },
            "latency": {
                "average_ms": round(avg_duration, 1),
                "median_ms": round(median_duration, 1),
                "p95_ms": round(p95_duration, 1)
            },
            "per_paper_metrics": {
                "sample_count": len(grading_events),
                "avg_input_tokens": round(avg_in_tokens, 1),
                "median_input_tokens": round(median_in_tokens, 1),
                "avg_output_tokens": round(avg_out_tokens, 1),
                "median_output_tokens": round(median_out_tokens, 1),
                "avg_total_tokens": round(avg_tot_tokens, 1),
                "median_total_tokens": round(median_tot_tokens, 1),
                "avg_cost_usd": round(avg_cost, 6),
                "p90_cost_usd": round(p90_cost, 6)
            },
            "quota_settings": quotas,
            "projections": {
                "batch_40": projections_40,
                "batch_50": projections_50
            },
            "recent_events": events[:30]
        }

    @staticmethod
    def _calculate_batch_projection(
        batch_size: int,
        avg_in_tok: float,
        avg_out_tok: float,
        avg_tot_tok: float,
        avg_cost: float,
        p90_in_tok: float,
        p90_out_tok: float,
        p90_tot_tok: float,
        p90_cost: float,
        retry_rate_pct: float,
        rpm: int,
        tpm: int,
        rpd: int
    ) -> Dict[str, Any]:
        expected_retries = math.ceil(batch_size * (retry_rate_pct / 100.0))
        total_requests_expected = batch_size + 1 + expected_retries

        avg_total_in = round((batch_size * avg_in_tok) + (expected_retries * avg_in_tok) + 2000)
        avg_total_out = round((batch_size * avg_out_tok) + (expected_retries * avg_out_tok) + 500)
        avg_total_tokens = avg_total_in + avg_total_out
        avg_total_cost = round((batch_size * avg_cost) + (expected_retries * avg_cost) + 0.0003, 5)

        p90_total_in = round((batch_size * p90_in_tok) + (expected_retries * p90_in_tok) + 2500)
        p90_total_out = round((batch_size * p90_out_tok) + (expected_retries * p90_out_tok) + 700)
        p90_total_tokens = p90_total_in + p90_total_out
        p90_total_cost = round((batch_size * p90_cost) + (expected_retries * p90_cost) + 0.0004, 5)

        min_minutes_for_rpm = math.ceil(total_requests_expected / max(1, rpm))
        safe_delay_per_submission_sec = math.ceil(60.0 / max(1, rpm))

        exceeds_rpd = total_requests_expected > rpd
        rpd_pct = round((total_requests_expected / max(1, rpd)) * 100, 1)

        feasibility_status = "FEASIBLE"
        bottlenecks = []
        if exceeds_rpd:
            feasibility_status = "EXCEEDS_DAILY_LIMIT"
            bottlenecks.append(f"Expected {total_requests_expected} calls exceeds RPD limit of {rpd}.")
        elif min_minutes_for_rpm > 1:
            bottlenecks.append(f"At {rpm} RPM, batch requires {min_minutes_for_rpm} minutes pacing to avoid HTTP 429.")

        return {
            "batch_size": batch_size,
            "total_calls_including_retries": total_requests_expected,
            "estimated_retries": expected_retries,
            "average_case": {
                "input_tokens": avg_total_in,
                "output_tokens": avg_total_out,
                "total_tokens": avg_total_tokens,
                "cost_usd": avg_total_cost
            },
            "conservative_case": {
                "input_tokens": p90_total_in,
                "output_tokens": p90_total_out,
                "total_tokens": p90_total_tokens,
                "cost_usd": p90_total_cost
            },
            "feasibility": {
                "status": feasibility_status,
                "min_pacing_minutes": min_minutes_for_rpm,
                "recommended_delay_sec": safe_delay_per_submission_sec,
                "daily_quota_consumed_pct": rpd_pct,
                "bottlenecks": bottlenecks
            }
        }

    @staticmethod
    def _percentile(data: List[float], p: float) -> float:
        if not data:
            return 0.0
        k = (len(data) - 1) * (p / 100.0)
        f = math.floor(k)
        c = math.ceil(k)
        if f == c:
            return float(data[int(k)])
        d0 = data[int(f)] * (c - k)
        d1 = data[int(c)] * (k - f)
        return float(d0 + d1)

    @staticmethod
    def _get_empty_metrics() -> Dict[str, Any]:
        quotas = UsageService.get_quota_settings()
        proj_40 = UsageService._calculate_batch_projection(
            batch_size=40, avg_in_tok=2400, avg_out_tok=650, avg_tot_tok=3050,
            avg_cost=0.00038, p90_in_tok=3100, p90_out_tok=850, p90_tot_tok=3950,
            p90_cost=0.00049, retry_rate_pct=5.0, rpm=quotas["rpm_limit"],
            tpm=quotas["tpm_limit"], rpd=quotas["rpd_limit"]
        )
        proj_50 = UsageService._calculate_batch_projection(
            batch_size=50, avg_in_tok=2400, avg_out_tok=650, avg_tot_tok=3050,
            avg_cost=0.00038, p90_in_tok=3100, p90_out_tok=850, p90_tot_tok=3950,
            p90_cost=0.00049, retry_rate_pct=5.0, rpm=quotas["rpm_limit"],
            tpm=quotas["tpm_limit"], rpd=quotas["rpd_limit"]
        )
        return {
            "summary": {
                "total_requests": 0, "successful_requests": 0, "failed_requests": 0,
                "retry_count": 0, "retry_rate_pct": 0.0, "failure_rate_pct": 0.0,
                "total_estimated_cost_usd": 0.0, "pricing_version": settings.PRICING_VERSION
            },
            "latency": {"average_ms": 0, "median_ms": 0, "p95_ms": 0},
            "per_paper_metrics": {
                "sample_count": 0, "avg_input_tokens": 0, "median_input_tokens": 0,
                "avg_output_tokens": 0, "median_output_tokens": 0, "avg_total_tokens": 0,
                "median_total_tokens": 0, "avg_cost_usd": 0.0, "p90_cost_usd": 0.0
            },
            "quota_settings": quotas,
            "projections": {"batch_40": proj_40, "batch_50": proj_50},
            "recent_events": []
        }

usage_service = UsageService()
