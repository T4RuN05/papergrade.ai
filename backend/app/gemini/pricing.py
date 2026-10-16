"""
Pricing calculation for Gemini API usage.
Calculates paid-equivalent cost estimates based on published Google AI Studio pricing.
"""

# Gemini 2.0 / 2.5 Flash Pricing (Standard Tier per million tokens)
# Source: Google AI Studio / Vertex AI pricing specifications
FLASH_INPUT_PRICE_PER_M = 0.075    # $0.075 per 1M input tokens
FLASH_OUTPUT_PRICE_PER_M = 0.300   # $0.300 per 1M output tokens
FLASH_CACHED_PRICE_PER_M = 0.01875  # $0.01875 per 1M cached tokens

def calculate_paid_equivalent_cost(
    input_tokens: int = 0,
    output_tokens: int = 0,
    cached_tokens: int = 0,
    thinking_tokens: int = 0,
    model_name: str = "gemini-3.8-flash"
) -> float:
    """
    Computes the estimated paid-equivalent cost in USD.
    Returns float rounded to 6 decimal places.
    """
    input_count = max(0, (input_tokens or 0) - (cached_tokens or 0))
    cached_count = max(0, cached_tokens or 0)
    # Thinking tokens are billed as output tokens in Gemini models
    output_count = max(0, (output_tokens or 0) + (thinking_tokens or 0))

    cost = (
        (input_count / 1_000_000.0) * FLASH_INPUT_PRICE_PER_M +
        (cached_count / 1_000_000.0) * FLASH_CACHED_PRICE_PER_M +
        (output_count / 1_000_000.0) * FLASH_OUTPUT_PRICE_PER_M
    )
    return round(cost, 6)
