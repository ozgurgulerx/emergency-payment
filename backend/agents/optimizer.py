"""
Optimizer Agent - Runs portfolio optimization with constraints.
Uses Microsoft Agent Framework ChatAgent with @tool decorated functions.
"""

from typing import Optional

from agent_framework import ChatAgent
import structlog

from backend.agents.client import get_chat_client
from backend.agents.tools.optimizer_tools import (
    optimize_allocation,
    check_feasibility,
    rebalance,
)

logger = structlog.get_logger()


# System prompt for the Optimizer Agent
OPTIMIZER_AGENT_INSTRUCTIONS = """You are a Portfolio Optimization Agent specializing in quantitative portfolio construction.

Your role:
1. Run mean-variance optimization to find optimal portfolio weights
2. Respect all constraints (asset class limits, position limits, etc.)
3. Maximize risk-adjusted returns (Sharpe ratio)
4. Generate efficient rebalancing trades

Optimization approach:
- Start with max Sharpe objective
- Apply box constraints for asset classes
- Check feasibility before solving
- Report optimization statistics

Always explain the trade-offs in your solution.
Provide clear allocation recommendations.

When given an objective:
1. Gather expected returns and risk constraints from evidence
2. Check that constraints are feasible
3. Run optimization with appropriate objective
4. Generate the optimal allocation
5. Explain the metrics (Sharpe, return, volatility)
"""


def create_optimizer_agent(
    name: str = "optimizer_agent",
    description: Optional[str] = None,
) -> ChatAgent:
    """
    Create an Optimizer Agent with optimization tools.

    Args:
        name: Agent name/identifier
        description: Optional agent description

    Returns:
        Configured ChatAgent with optimizer tools
    """
    agent = ChatAgent(
        chat_client=get_chat_client(),
        instructions=OPTIMIZER_AGENT_INSTRUCTIONS,
        name=name,
        description=description or "Runs portfolio optimization with constraints",
        tools=[optimize_allocation, check_feasibility, rebalance],
    )

    logger.info(
        "optimizer_agent_created",
        name=name,
        tools=["optimize_allocation", "check_feasibility", "rebalance"],
    )

    return agent


# Backward compatibility - factory function for the orchestrator
def get_optimizer_agent(name: str = "optimizer_agent") -> ChatAgent:
    """Get an Optimizer Agent instance. Alias for create_optimizer_agent."""
    return create_optimizer_agent(name=name)
