import pytest
from backend.app.services.usage_service import usage_service
from backend.app.gemini.pricing import calculate_paid_equivalent_cost

def test_pricing_calculation():
    # 2,000 input tokens, 500 output tokens, 0 cached
    cost = calculate_paid_equivalent_cost(input_tokens=2000, output_tokens=500)
    # (2000 / 1M) * 0.075 + (500 / 1M) * 0.30 = 0.00015 + 0.00015 = 0.00030
    assert cost > 0.0002
    assert cost < 0.0005

def test_batch_projections_40_and_50():
    metrics = usage_service.get_usage_metrics()
    assert "projections" in metrics
    proj_40 = metrics["projections"]["batch_40"]
    proj_50 = metrics["projections"]["batch_50"]

    assert proj_40["batch_size"] == 40
    assert proj_50["batch_size"] == 50

    # Total calls include batch size + 1 setup + retries
    assert proj_40["total_calls_including_retries"] >= 41
    assert proj_50["total_calls_including_retries"] >= 51

    # Average and conservative costs exist
    assert proj_40["average_case"]["cost_usd"] > 0
    assert proj_40["conservative_case"]["cost_usd"] >= proj_40["average_case"]["cost_usd"]

    # Feasibility metrics
    assert "feasibility" in proj_40
    assert "min_pacing_minutes" in proj_40["feasibility"]
    assert proj_40["feasibility"]["min_pacing_minutes"] >= 1
