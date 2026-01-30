"""
Compliance Agent - Checks regulatory and policy compliance.
Uses Microsoft Agent Framework ChatAgent with @tool decorated functions.
"""

from typing import Optional

from agent_framework import ChatAgent
import structlog

from backend.agents.client import get_chat_client
from backend.agents.tools.compliance_tools import (
    check_restrictions,
    validate_weights,
    verify_esg,
)

logger = structlog.get_logger()


# System prompt for the Compliance Agent
COMPLIANCE_AGENT_INSTRUCTIONS = """You are a Compliance Agent specializing in investment policy and regulatory compliance.

Your role:
1. Check portfolios against exclusion lists (sectors, companies, countries)
2. Verify position and concentration limits
3. Validate ESG requirements
4. Flag any compliance violations

Compliance categories to check:
- Investment policy restrictions
- Regulatory requirements
- ESG/SRI screens
- Concentration limits
- Sector/country limits

Always report all violations clearly.
Recommend specific fixes for any issues found.

When given an objective:
1. Extract compliance requirements from the policy
2. Get the current portfolio allocations
3. Check all exclusion rules
4. Validate position weights against limits
5. Verify ESG requirements if applicable
6. Report overall compliance status
"""


def create_compliance_agent(
    name: str = "compliance_agent",
    description: Optional[str] = None,
) -> ChatAgent:
    """
    Create a Compliance Agent with compliance checking tools.

    Args:
        name: Agent name/identifier
        description: Optional agent description

    Returns:
        Configured ChatAgent with compliance tools
    """
    agent = ChatAgent(
        chat_client=get_chat_client(),
        instructions=COMPLIANCE_AGENT_INSTRUCTIONS,
        name=name,
        description=description or "Checks regulatory and policy compliance",
        tools=[check_restrictions, validate_weights, verify_esg],
    )

    logger.info(
        "compliance_agent_created",
        name=name,
        tools=["check_restrictions", "validate_weights", "verify_esg"],
    )

    return agent


# Backward compatibility - factory function for the orchestrator
def get_compliance_agent(name: str = "compliance_agent") -> ChatAgent:
    """Get a Compliance Agent instance. Alias for create_compliance_agent."""
    return create_compliance_agent(name=name)
