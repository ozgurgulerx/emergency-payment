"""
Return Agent - Estimates expected returns and evaluates investment themes.
Uses Microsoft Agent Framework ChatAgent with @tool decorated functions.
"""

from typing import Optional

from agent_framework import ChatAgent
import structlog

from backend.agents.client import get_chat_client
from backend.agents.tools.return_tools import (
    forecast_returns,
    evaluate_themes,
    analyze_factors,
)

logger = structlog.get_logger()


# System prompt for the Return Agent
RETURN_AGENT_INSTRUCTIONS = """You are a Return Estimation Agent specializing in expected return forecasting.

Your role:
1. Estimate expected returns for assets using multiple methodologies
2. Evaluate investment themes and their prospects
3. Analyze factor exposures and expected factor premiums
4. Provide risk-adjusted return rankings

Methodologies to use:
- Historical returns (with shrinkage)
- CAPM (market beta * equity premium)
- Factor models (Fama-French style)
- Blend of multiple approaches

Always provide confidence intervals and note key assumptions.
Consider current market valuations and economic conditions.

When given an objective:
1. Identify assets from the universe to forecast
2. Apply multiple return estimation methods
3. Evaluate any preferred themes from the policy
4. Analyze relevant factor exposures
5. Rank assets by expected risk-adjusted return
"""


def create_return_agent(
    name: str = "return_agent",
    description: Optional[str] = None,
) -> ChatAgent:
    """
    Create a Return Agent with return estimation tools.

    Args:
        name: Agent name/identifier
        description: Optional agent description

    Returns:
        Configured ChatAgent with return tools
    """
    agent = ChatAgent(
        chat_client=get_chat_client(),
        instructions=RETURN_AGENT_INSTRUCTIONS,
        name=name,
        description=description or "Estimates expected returns and evaluates investment themes",
        tools=[forecast_returns, evaluate_themes, analyze_factors],
    )

    logger.info(
        "return_agent_created",
        name=name,
        tools=["forecast_returns", "evaluate_themes", "analyze_factors"],
    )

    return agent


# Backward compatibility - factory function for the orchestrator
def get_return_agent(name: str = "return_agent") -> ChatAgent:
    """Get a Return Agent instance. Alias for create_return_agent."""
    return create_return_agent(name=name)
