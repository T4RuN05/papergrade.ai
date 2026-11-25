"""
Pricing calculation for Gemini API usage.
Calculates paid-equivalent cost estimates based on published Google AI Studio pricing per model tier.
"""

from typing import Dict

# Model-tier pricing per million tokens (USD)
MODEL_PRICING_PER_M: Dict[str, Dict[str, float]] = {
    "flash-lite": {"input": 0.0375, "output": 0.150, "cached": 0.009375},
    "flash": {"input": 0.075, "output": 0.300, "cached": 0.01875},
    "pro": {"input": 1.250, "output": 5.000, "cached": 0.3125},
}

DEFAULT_TIER = "flash"
FLASH_INPUT_PRICE_PER_M = MODEL_PRICING_PER_M[DEFAULT_TIER]["input"]
FLASH_OUTPUT_PRICE_PER_M = MODEL_PRICING_PER_M[DEFAULT_TIER]["output"]
FLASH_CACHED_PRICE_PER_M = MODEL_PRICING_PER_M[DEFAULT_TIER]["cached"]


def _resolve_model_rates(model_name: str) -> Dict[str, float]:
    normalized = (model_name or "").lower()
    # Match more specific tiers (flash-lite) before generic flash/pro
    for tier in ("flash-lite", "lite", "pro", "flash"):
        if tier in normalized:
            mapped = "flash-lite" if tier == "lite" else tier
            return MODEL_PRICING_PER_M[mapped]
    return MODEL_PRICING_PER_M[DEFAULT_TIER]


def calculate_paid_equivalent_cost(
    input_tokens: int = 0,
    output_tokens: int = 0,
    cached_tokens: int = 0,
    thinking_tokens: int = 0,
    model_name: str = "gemini-3.8-flash"
) -> float:
    """
    Computes the estimated paid-equivalent cost in USD based on model tier.
    Returns float rounded to 6 decimal places.
    """
    rates = _resolve_model_rates(model_name)
    input_count = max(0, (input_tokens or 0) - (cached_tokens or 0))
    cached_count = max(0, cached_tokens or 0)
    # Thinking tokens are billed as output tokens in Gemini models
    output_count = max(0, (output_tokens or 0) + (thinking_tokens or 0))

    cost = (
        (input_count / 1_000_000.0) * rates["input"] +
        (cached_count / 1_000_000.0) * rates["cached"] +
        (output_count / 1_000_000.0) * rates["output"]
    )
    return round(cost, 6)
