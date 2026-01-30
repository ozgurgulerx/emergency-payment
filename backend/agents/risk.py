"""
Risk Agent - Computes risk metrics and constraints for portfolio construction.
Uses Microsoft Agent Framework ChatAgent with @tool decorated functions.
"""

from typing import Optional

from agent_framework import ChatAgent
import structlog

from backend.agents.client import get_chat_client
from backend.agents.tools.risk_tools import (
    compute_var,
    stress_test,
    check_limits,
)

logger = structlog.get_logger()


# System prompt for the Risk Agent
RISK_AGENT_INSTRUCTIONS = """You are a Risk Analysis Agent specializing in portfolio risk management.

Your role:
1. Compute risk metrics: VaR, CVaR, volatility, max drawdown
2. Run stress tests under various market scenarios
3. Verify portfolios meet investor risk constraints
4. Recommend position size limits based on risk budget

Key risk constraints to check:
- Maximum portfolio volatility
- Maximum drawdown tolerance
- Value at Risk limits
- Concentration limits
- Liquidity requirements

Always provide clear explanations of risk findings.
Flag any constraint violations immediately.

When given an objective:
1. Extract risk constraints from the policy
2. Compute VaR and other metrics for the current allocation
3. Run stress tests under relevant scenarios
4. Check all limits and report violations
5. Recommend maximum equity allocation based on drawdown target
"""


def create_risk_agent(
    name: str = "risk_agent",
    description: Optional[str] = None,
) -> ChatAgent:
    """
    Create a Risk Agent with risk analysis tools.

    Args:
        name: Agent name/identifier
        description: Optional agent description

    Returns:
        Configured ChatAgent with risk tools
    """
    agent = ChatAgent(
        chat_client=get_chat_client(),
        instructions=RISK_AGENT_INSTRUCTIONS,
        name=name,
        description=description or "Computes risk metrics and validates constraints",
        tools=[compute_var, stress_test, check_limits],
    )

    logger.info(
        "risk_agent_created",
        name=name,
        tools=["compute_var", "stress_test", "check_limits"],
    )

    return agent


# Backward compatibility - factory function for the orchestrator
def get_risk_agent(name: str = "risk_agent") -> ChatAgent:
    """Get a Risk Agent instance. Alias for create_risk_agent."""
    return create_risk_agent(name=name)
