"""
Market Agent - Retrieves market data and builds investment universe.
Uses Microsoft Agent Framework ChatAgent with @tool decorated functions.
"""

from typing import Optional

from agent_framework import ChatAgent
import structlog

from backend.agents.client import get_chat_client
from backend.agents.tools.market_tools import (
    query_universe,
    fetch_prices,
    get_fundamentals,
)

logger = structlog.get_logger()


# System prompt for the Market Agent
MARKET_AGENT_INSTRUCTIONS = """You are a Market Data Agent specializing in investment universe construction.

Your role:
1. Query the fund database to build an investable universe
2. Apply filters based on policy constraints (AUM, asset class, liquidity)
3. Retrieve current prices and fundamental data
4. Provide clean, validated data for other agents

You have access to the nport_funds database with SEC N-PORT filings.
Always ensure data quality and flag any anomalies.
Be concise in your responses - focus on actionable data.

When given an objective:
1. First determine the universe requirements from the policy
2. Query the universe with appropriate filters
3. Fetch prices for the relevant assets
4. Summarize your findings with key metrics
"""


def create_market_agent(
    name: str = "market_agent",
    description: Optional[str] = None,
) -> ChatAgent:
    """
    Create a Market Agent with market data tools.

    Args:
        name: Agent name/identifier
        description: Optional agent description

    Returns:
        Configured ChatAgent with market tools
    """
    agent = ChatAgent(
        chat_client=get_chat_client(),
        instructions=MARKET_AGENT_INSTRUCTIONS,
        name=name,
        description=description or "Retrieves market data and builds investment universe",
        tools=[query_universe, fetch_prices, get_fundamentals],
    )

    logger.info(
        "market_agent_created",
        name=name,
        tools=["query_universe", "fetch_prices", "get_fundamentals"],
    )

    return agent


# Backward compatibility - factory function for the orchestrator
def get_market_agent(name: str = "market_agent") -> ChatAgent:
    """Get a Market Agent instance. Alias for create_market_agent."""
    return create_market_agent(name=name)
