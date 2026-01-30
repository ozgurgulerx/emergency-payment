"""
Workflow definitions for Emergency Payment Runbook using Agent Framework.

This module creates sequential workflows that chain the Foundry agent executors:
Intake → Sanctions → Liquidity → Procedures → Summarize
"""

from typing import Optional
from datetime import datetime, timezone

from agent_framework import (
    Workflow,
    WorkflowBuilder,
)
import structlog

from .config import get_settings
from .executors import (
    EmergencyPaymentState,
    IntakeExecutor,
    SanctionsExecutor,
    LiquidityExecutor,
    ProceduresExecutor,
    SummarizeExecutor,
)
from .foundry_client import FoundryAgentClient, get_foundry_client
from .sse import SSEManager, get_sse_manager

logger = structlog.get_logger()


def create_emergency_payment_workflow(
    foundry_client: Optional[FoundryAgentClient] = None,
    sse_manager: Optional[SSEManager] = None,
    name: str = "emergency_payment_workflow",
) -> Workflow:
    """
    Create the Emergency Payment sequential workflow.

    This workflow chains the following executors:
    1. IntakeExecutor - Parse and validate payment request
    2. SanctionsExecutor - Screen beneficiary against sanctions lists
    3. LiquidityExecutor - Check liquidity impact (skipped if sanctions BLOCK)
    4. ProceduresExecutor - Determine operational procedures (skipped if sanctions BLOCK)
    5. SummarizeExecutor - Create final DecisionPacket

    Args:
        foundry_client: Optional Foundry client (uses singleton if not provided)
        sse_manager: Optional SSE manager for event streaming
        name: Workflow name

    Returns:
        Configured Workflow instance
    """
    settings = get_settings()
    foundry = foundry_client or get_foundry_client()
    sse = sse_manager or get_sse_manager()

    logger.info(
        "creating_emergency_payment_workflow",
        name=name,
        sanctions_agent=settings.azure_foundry_agent_sanctions,
        liquidity_agent=settings.azure_foundry_agent_liquidity,
        procedures_agent=settings.azure_foundry_agent_procedures,
    )

    # Create executors
    intake_executor = IntakeExecutor(sse_manager=sse)
    sanctions_executor = SanctionsExecutor(
        foundry_client=foundry,
        sse_manager=sse,
        agent_name=settings.azure_foundry_agent_sanctions,
    )
    liquidity_executor = LiquidityExecutor(
        foundry_client=foundry,
        sse_manager=sse,
        agent_name=settings.azure_foundry_agent_liquidity,
    )
    procedures_executor = ProceduresExecutor(
        foundry_client=foundry,
        sse_manager=sse,
        agent_name=settings.azure_foundry_agent_procedures,
    )
    summarize_executor = SummarizeExecutor(sse_manager=sse)

    # Build workflow using WorkflowBuilder with explicit executor chain
    workflow = (
        WorkflowBuilder(name=name, max_iterations=10)
        # Register executors
        .register_executor(lambda: intake_executor, name="Intake")
        .register_executor(lambda: sanctions_executor, name="Sanctions")
        .register_executor(lambda: liquidity_executor, name="Liquidity")
        .register_executor(lambda: procedures_executor, name="Procedures")
        .register_executor(lambda: summarize_executor, name="Summarize")
        # Set start point
        .set_start_executor("Intake")
        # Chain executors sequentially
        .add_chain(["Intake", "Sanctions", "Liquidity", "Procedures", "Summarize"])
        .build()
    )

    logger.info(
        "emergency_payment_workflow_created",
        name=name,
        executor_count=5,
    )

    return workflow


class WorkflowType:
    """Available workflow types for Emergency Payment."""
    SEQUENTIAL = "sequential"  # Default: Intake → Sanctions → Liquidity → Procedures → Summarize


def create_workflow(
    workflow_type: str = WorkflowType.SEQUENTIAL,
    **kwargs,
) -> Workflow:
    """
    Factory function to create Emergency Payment workflows.

    Args:
        workflow_type: Type of workflow to create (currently only 'sequential')
        **kwargs: Additional arguments passed to workflow creator

    Returns:
        Configured Workflow instance
    """
    if workflow_type == WorkflowType.SEQUENTIAL:
        return create_emergency_payment_workflow(**kwargs)
    else:
        raise ValueError(f"Unknown workflow type: {workflow_type}")
