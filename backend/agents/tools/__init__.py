"""
Agent Framework tools for portfolio optimization agents.
All tools use the @tool decorator from agent-framework.
"""

from backend.agents.tools.market_tools import (
    query_universe,
    fetch_prices,
    get_fundamentals,
)
from backend.agents.tools.risk_tools import (
    compute_var,
    stress_test,
    check_limits,
)
from backend.agents.tools.return_tools import (
    forecast_returns,
    evaluate_themes,
    analyze_factors,
)
from backend.agents.tools.optimizer_tools import (
    optimize_allocation,
    check_feasibility,
    rebalance,
)
from backend.agents.tools.compliance_tools import (
    check_restrictions,
    validate_weights,
    verify_esg,
)

__all__ = [
    # Market tools
    "query_universe",
    "fetch_prices",
    "get_fundamentals",
    # Risk tools
    "compute_var",
    "stress_test",
    "check_limits",
    # Return tools
    "forecast_returns",
    "evaluate_themes",
    "analyze_factors",
    # Optimizer tools
    "optimize_allocation",
    "check_feasibility",
    "rebalance",
    # Compliance tools
    "check_restrictions",
    "validate_weights",
    "verify_esg",
]
