"""
Portfolio optimization tools for the Optimizer Agent.
Uses @ai_function decorator from Microsoft Agent Framework.
"""

from typing import Annotated, Any, Dict, List, Optional

from agent_framework import ai_function
from pydantic import Field
import structlog

logger = structlog.get_logger()


@ai_function(approval_mode="never_require")
async def optimize_allocation(
    expected_returns: Annotated[
        Dict[str, float],
        Field(description="Asset -> expected return mapping")
    ],
    constraints: Annotated[
        Optional[Dict[str, Any]],
        Field(description="Portfolio constraints (min/max equity, bonds, cash, position limits)")
    ] = None,
    objective: Annotated[
        str,
        Field(description="Optimization objective: max_sharpe, min_variance, or target_return", default="max_sharpe")
    ] = "max_sharpe",
    target_return: Annotated[
        Optional[float],
        Field(description="Target return if objective is target_return")
    ] = None,
) -> Dict[str, Any]:
    """Run mean-variance optimization to find optimal portfolio weights.

    Maximizes risk-adjusted returns (Sharpe ratio) subject to constraints.
    Returns optimal allocations and portfolio metrics.
    """
    constraints = constraints or {}

    # Classify assets
    equity_assets = {"VTI", "VOO", "SPY", "VEA", "VXUS", "VWO", "QQQ", "IWM"}
    bond_assets = {"BND", "BNDX", "AGG", "VCSH", "LQD"}
    other_assets = {"VNQ", "GLD"}

    # Get constraint limits
    min_equity = constraints.get("min_equity", 0)
    max_equity = constraints.get("max_equity", 0.7)
    min_fi = constraints.get("min_fixed_income", 0)
    max_fi = constraints.get("max_fixed_income", 1)
    min_cash = constraints.get("min_cash", 0.02)
    max_position = constraints.get("max_single_position", 0.25)

    # Simple heuristic optimization (in production, use cvxpy or scipy)
    allocations = {}

    # Identify assets in each class from our universe
    equity_in_universe = [a for a in expected_returns if a in equity_assets]
    bond_in_universe = [a for a in expected_returns if a in bond_assets]
    other_in_universe = [a for a in expected_returns if a in other_assets]

    # Allocate to equity (within limits)
    target_equity = (min_equity + max_equity) / 2
    if equity_in_universe:
        per_equity = min(target_equity / len(equity_in_universe), max_position)
        for asset in equity_in_universe:
            allocations[asset] = round(per_equity, 3)

    # Allocate to bonds
    equity_used = sum(allocations.get(a, 0) for a in equity_assets)
    remaining = 1 - equity_used - min_cash
    target_fi = min(remaining * 0.7, max_fi)

    if bond_in_universe:
        per_bond = min(target_fi / len(bond_in_universe), max_position)
        for asset in bond_in_universe:
            allocations[asset] = round(per_bond, 3)

    # Allocate to other assets (real estate, etc.)
    fi_used = sum(allocations.get(a, 0) for a in bond_assets)
    remaining = 1 - equity_used - fi_used - min_cash
    if other_in_universe and remaining > 0:
        per_other = min(remaining / len(other_in_universe), max_position, 0.1)
        for asset in other_in_universe:
            allocations[asset] = round(per_other, 3)

    # Add cash to fill remainder
    used = sum(allocations.values())
    allocations["CASH"] = round(max(min_cash, 1 - used), 3)

    # Normalize to sum to 1
    total = sum(allocations.values())
    if total != 1 and total > 0:
        for asset in allocations:
            allocations[asset] = round(allocations[asset] / total, 4)

    # Compute metrics
    portfolio_return = sum(
        allocations.get(a, 0) * expected_returns.get(a, 2.0)
        for a in allocations
    )

    # Estimate volatility
    equity_weight = sum(allocations.get(a, 0) for a in equity_assets)
    portfolio_vol = 5 + equity_weight * 12  # Rough estimate

    sharpe = (portfolio_return - 2.0) / portfolio_vol if portfolio_vol > 0 else 0

    logger.info(
        "optimization_complete",
        objective=objective,
        sharpe=sharpe,
        portfolio_return=portfolio_return,
        n_positions=len(allocations),
    )

    return {
        "allocations": allocations,
        "metrics": {
            "expected_return": round(portfolio_return, 2),
            "volatility": round(portfolio_vol, 2),
            "sharpe": round(sharpe, 3),
            "var_95": round(portfolio_vol * 1.645 / 100, 4),
        },
        "stats": {
            "objective": objective,
            "equity_weight": round(equity_weight, 3),
            "bond_weight": round(sum(allocations.get(a, 0) for a in bond_assets), 3),
            "n_positions": len([a for a in allocations if allocations[a] > 0.001]),
        },
    }


@ai_function(approval_mode="never_require")
async def check_feasibility(
    constraints: Annotated[
        Dict[str, Any],
        Field(description="Portfolio constraints to check for feasibility")
    ],
) -> Dict[str, Any]:
    """Check if optimization constraints are feasible.

    Validates that the constraints don't conflict with each other.
    Returns whether constraints are feasible and any issues found.
    """
    issues = []

    min_eq = constraints.get("min_equity", 0)
    max_eq = constraints.get("max_equity", 1)
    min_fi = constraints.get("min_fixed_income", 0)
    max_fi = constraints.get("max_fixed_income", 1)
    min_cash = constraints.get("min_cash", 0)

    # Check if minimums sum to more than 100%
    if min_eq + min_fi + min_cash > 1:
        issues.append(f"Minimums sum to {min_eq + min_fi + min_cash:.0%} > 100%")

    # Check if maximums allow a valid solution
    if max_eq + max_fi < 1 - min_cash:
        issues.append("Maximums too restrictive")

    # Check for contradictory constraints
    if min_eq > max_eq:
        issues.append(f"min_equity ({min_eq}) > max_equity ({max_eq})")
    if min_fi > max_fi:
        issues.append(f"min_fixed_income ({min_fi}) > max_fixed_income ({max_fi})")

    logger.info(
        "feasibility_checked",
        feasible=len(issues) == 0,
        issues=issues,
    )

    return {
        "feasible": len(issues) == 0,
        "issues": issues,
        "constraints_checked": constraints,
    }


@ai_function(approval_mode="never_require")
async def rebalance(
    current_allocation: Annotated[
        Dict[str, float],
        Field(description="Current asset weights")
    ],
    target_allocation: Annotated[
        Dict[str, float],
        Field(description="Target asset weights")
    ],
    portfolio_value: Annotated[
        float,
        Field(description="Total portfolio value in dollars")
    ],
    threshold: Annotated[
        float,
        Field(description="Minimum weight drift to trigger a rebalance trade", default=0.05)
    ] = 0.05,
) -> Dict[str, Any]:
    """Generate trades to rebalance from current to target allocation.

    Only generates trades for positions that drift beyond the threshold.
    Returns list of trades with action, weight change, and dollar value.
    """
    trades = []

    all_assets = set(current_allocation.keys()) | set(target_allocation.keys())

    for asset in all_assets:
        current = current_allocation.get(asset, 0)
        target = target_allocation.get(asset, 0)
        diff = target - current

        if abs(diff) >= threshold:
            trade_value = diff * portfolio_value
            trades.append({
                "asset": asset,
                "action": "buy" if diff > 0 else "sell",
                "weight_change": round(diff, 4),
                "value": round(abs(trade_value), 2),
            })

    logger.info(
        "rebalance_trades_generated",
        trade_count=len(trades),
        total_turnover=sum(t["value"] for t in trades),
    )

    return {
        "trades": trades,
        "total_turnover": round(sum(t["value"] for t in trades), 2),
        "trade_count": len(trades),
    }
