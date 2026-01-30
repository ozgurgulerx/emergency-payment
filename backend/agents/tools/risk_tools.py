"""
Risk analysis tools for the Risk Agent.
Uses @ai_function decorator from Microsoft Agent Framework.
"""

import math
from typing import Annotated, Any, Dict, List, Optional

from agent_framework import ai_function
from pydantic import Field
import structlog

logger = structlog.get_logger()


@ai_function(approval_mode="never_require")
async def compute_var(
    allocations: Annotated[
        Dict[str, float],
        Field(description="Asset -> weight mapping for the portfolio")
    ],
    portfolio_value: Annotated[
        float,
        Field(description="Total portfolio value in dollars")
    ],
    confidence: Annotated[
        float,
        Field(description="Confidence level (e.g., 0.95 for 95%)", default=0.95)
    ] = 0.95,
    horizon_days: Annotated[
        int,
        Field(description="Time horizon in days", default=1)
    ] = 1,
) -> Dict[str, Any]:
    """Compute Value at Risk (VaR) for a portfolio.

    Calculates VaR using a simplified volatility model based on asset class weights.
    Returns VaR as both percentage and dollar amount.
    """
    # Estimate portfolio volatility based on allocations
    bond_assets = {"BND", "BNDX", "VCSH", "AGG", "LQD"}
    cash_assets = {"CASH"}

    equity_weight = sum(
        w for asset, w in allocations.items()
        if asset not in bond_assets and asset not in cash_assets
    )
    bond_weight = sum(
        w for asset, w in allocations.items()
        if asset in bond_assets
    )

    # Simplified volatility model
    equity_vol = 0.16  # 16% annual volatility for equities
    bond_vol = 0.05    # 5% annual volatility for bonds

    # Portfolio volatility with correlation
    portfolio_vol = math.sqrt(
        (equity_weight * equity_vol) ** 2 +
        (bond_weight * bond_vol) ** 2 +
        2 * equity_weight * bond_weight * 0.1 * equity_vol * bond_vol  # Correlation ~0.1
    )

    # Daily volatility
    daily_vol = portfolio_vol / math.sqrt(252)

    # VaR at confidence level (assuming normal distribution)
    z_score = {0.95: 1.645, 0.99: 2.326}.get(confidence, 1.645)
    var_pct = z_score * daily_vol * math.sqrt(horizon_days)
    var_dollar = var_pct * portfolio_value

    logger.info(
        "var_computed",
        var_pct=var_pct,
        var_dollar=var_dollar,
        confidence=confidence,
    )

    return {
        "var_pct": var_pct,
        "var_dollar": var_dollar,
        "confidence": confidence,
        "horizon_days": horizon_days,
        "portfolio_volatility_annual": portfolio_vol,
    }


@ai_function(approval_mode="never_require")
async def stress_test(
    allocations: Annotated[
        Dict[str, float],
        Field(description="Asset -> weight mapping for the portfolio")
    ],
    portfolio_value: Annotated[
        float,
        Field(description="Total portfolio value in dollars")
    ],
    scenarios: Annotated[
        Optional[List[str]],
        Field(description="Scenarios to test: market_crash, rates_up, risk_off, inflation, recession")
    ] = None,
) -> Dict[str, Any]:
    """Run stress tests on portfolio under various market scenarios.

    Tests the portfolio against predefined shock scenarios and returns
    the impact on portfolio value for each scenario.
    """
    scenarios = scenarios or ["market_crash", "rates_up"]

    # Define scenario shocks
    scenario_shocks = {
        "market_crash": {"equity": -0.30, "bonds": 0.05, "real_estate": -0.25},
        "rates_up": {"equity": -0.10, "bonds": -0.15, "real_estate": -0.15},
        "risk_off": {"equity": -0.20, "bonds": 0.08, "real_estate": -0.10},
        "inflation": {"equity": -0.05, "bonds": -0.10, "real_estate": 0.05},
        "recession": {"equity": -0.35, "bonds": 0.10, "real_estate": -0.30},
    }

    bond_assets = {"BND", "BNDX", "VCSH", "AGG", "LQD"}
    real_estate_assets = {"VNQ", "VNQI", "IYR"}

    results = {}
    for scenario in scenarios:
        shocks = scenario_shocks.get(scenario, {"equity": -0.15, "bonds": 0})

        # Calculate impact based on asset class weights
        equity_weight = sum(
            w for asset, w in allocations.items()
            if asset not in bond_assets and asset not in real_estate_assets and asset != "CASH"
        )
        bond_weight = sum(
            w for asset, w in allocations.items()
            if asset in bond_assets
        )
        real_estate_weight = sum(
            w for asset, w in allocations.items()
            if asset in real_estate_assets
        )

        impact = (
            equity_weight * shocks.get("equity", 0) +
            bond_weight * shocks.get("bonds", 0) +
            real_estate_weight * shocks.get("real_estate", 0)
        )

        results[scenario] = {
            "impact_pct": impact,
            "impact_dollar": impact * portfolio_value,
        }

    worst_scenario = min(results.keys(), key=lambda s: results[s]["impact_pct"])

    logger.info(
        "stress_test_complete",
        scenarios=list(results.keys()),
        worst_scenario=worst_scenario,
    )

    return {
        "scenarios": results,
        "worst_scenario": worst_scenario,
        "max_loss": results[worst_scenario]["impact_pct"],
        "max_loss_dollar": results[worst_scenario]["impact_dollar"],
    }


@ai_function(approval_mode="never_require")
async def check_limits(
    allocations: Annotated[
        Dict[str, float],
        Field(description="Asset -> weight mapping for the portfolio")
    ],
    max_volatility: Annotated[
        float,
        Field(description="Maximum allowed portfolio volatility (%)", default=15.0)
    ] = 15.0,
    max_drawdown: Annotated[
        float,
        Field(description="Maximum allowed drawdown (%)", default=20.0)
    ] = 20.0,
    var_limit: Annotated[
        Optional[float],
        Field(description="VaR limit as % of portfolio")
    ] = None,
) -> Dict[str, Any]:
    """Check if portfolio meets risk limits.

    Validates the portfolio against volatility, drawdown, and VaR constraints.
    Returns list of any violations found.
    """
    bond_assets = {"BND", "BNDX", "VCSH", "AGG", "LQD"}

    # Compute actual metrics
    equity_weight = sum(
        w for asset, w in allocations.items()
        if asset not in bond_assets and asset != "CASH"
    )

    # Simplified volatility estimate: 5% base + equity contribution
    actual_volatility = 0.05 + equity_weight * 0.11
    actual_volatility_pct = actual_volatility * 100

    # Estimate max drawdown from volatility (rough heuristic)
    estimated_max_drawdown = actual_volatility * 2.5 * 100

    violations = []
    if actual_volatility_pct > max_volatility:
        violations.append(f"volatility ({actual_volatility_pct:.1f}% > {max_volatility}%)")
    if estimated_max_drawdown > max_drawdown:
        violations.append(f"drawdown ({estimated_max_drawdown:.1f}% > {max_drawdown}%)")
    if var_limit and actual_volatility * 1.645 * 100 > var_limit:
        violations.append("VaR exceeds limit")

    logger.info(
        "limits_checked",
        violations=len(violations),
        actual_volatility=actual_volatility_pct,
    )

    return {
        "actual_volatility": actual_volatility_pct,
        "estimated_max_drawdown": estimated_max_drawdown,
        "violations": violations,
        "limits_satisfied": len(violations) == 0,
    }
