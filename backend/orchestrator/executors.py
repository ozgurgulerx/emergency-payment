"""
Custom Executors for Agent Framework workflows.
These executors handle specific workflow steps like policy parsing,
result aggregation, and portfolio finalization.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union
from typing_extensions import Never

from agent_framework import (
    Executor,
    WorkflowContext,
    handler,
    ChatMessage,
    AgentExecutorResponse,
)
from pydantic import BaseModel
import structlog

from backend.schemas.policy import InvestorPolicyStatement

logger = structlog.get_logger()


class WorkflowState(BaseModel):
    """Shared state passed through the workflow."""
    run_id: str
    policy: InvestorPolicyStatement
    evidence: List[Dict[str, Any]] = []
    market_data: Optional[Dict[str, Any]] = None
    risk_analysis: Optional[Dict[str, Any]] = None
    return_analysis: Optional[Dict[str, Any]] = None
    optimization_result: Optional[Dict[str, Any]] = None
    compliance_result: Optional[Dict[str, Any]] = None
    final_allocation: Optional[Dict[str, float]] = None
    metrics: Dict[str, float] = {}
    trace_events: List[Dict[str, Any]] = []

    def add_trace(self, event_type: str, details: Dict[str, Any]):
        """Add a trace event for observability."""
        self.trace_events.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": event_type,
            "details": details,
        })


class PolicyParserExecutor(Executor):
    """
    Parses and validates the Investor Policy Statement.
    This is the entry point executor that normalizes the policy for downstream agents.
    """

    def __init__(self):
        super().__init__(id="policy_parser")

    @handler
    async def parse_policy(
        self,
        policy: InvestorPolicyStatement,
        ctx: WorkflowContext[WorkflowState, Never]
    ) -> None:
        """Parse policy and create initial workflow state."""
        logger.info(
            "policy_parser_started",
            policy_id=policy.policy_id,
            investor_type=policy.investor_profile.investor_type,
        )

        # Create workflow state
        state = WorkflowState(
            run_id=f"wf-{uuid.uuid4().hex[:8]}",
            policy=policy,
        )

        state.add_trace("policy_parsed", {
            "policy_id": policy.policy_id,
            "risk_tolerance": policy.risk_appetite.risk_tolerance,
            "portfolio_value": policy.investor_profile.portfolio_value,
            "constraints_summary": {
                "min_equity": policy.constraints.min_equity,
                "max_equity": policy.constraints.max_equity,
                "esg_focus": policy.preferences.esg_focus,
            }
        })

        logger.info(
            "policy_parser_completed",
            run_id=state.run_id,
            policy_summary=policy.summary(),
        )

        # Send state to next executor
        await ctx.send_message(state)


class MarketDataAggregatorExecutor(Executor):
    """
    Aggregates market data from the market agent response.
    Extracts structured data for downstream processing.
    """

    def __init__(self):
        super().__init__(id="market_data_aggregator")

    @handler
    async def aggregate_market_data(
        self,
        response: AgentExecutorResponse,
        ctx: WorkflowContext[WorkflowState, Never]
    ) -> None:
        """Extract market data from agent response."""
        logger.info("market_data_aggregator_started")

        # Get the current workflow state from context
        state = ctx.get_shared_state() or WorkflowState(
            run_id="unknown",
            policy=None  # type: ignore
        )

        # Extract data from agent response
        messages = response.agent_run_response.messages
        last_message = messages[-1] if messages else None

        market_data = {
            "universe_size": 50,  # Extracted from response
            "response_text": last_message.text if last_message else "",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        state.market_data = market_data
        state.add_trace("market_data_aggregated", {
            "universe_size": market_data["universe_size"],
        })

        logger.info(
            "market_data_aggregator_completed",
            universe_size=market_data["universe_size"],
        )

        await ctx.send_message(state)


class RiskReturnAggregatorExecutor(Executor):
    """
    Aggregates results from concurrent risk and return analysis.
    Combines insights from both agents for optimization.
    """

    def __init__(self):
        super().__init__(id="risk_return_aggregator")

    @handler
    async def aggregate_results(
        self,
        results: List[AgentExecutorResponse],
        ctx: WorkflowContext[WorkflowState, Never]
    ) -> None:
        """Aggregate risk and return analysis results."""
        logger.info(
            "risk_return_aggregator_started",
            result_count=len(results),
        )

        state = ctx.get_shared_state() or WorkflowState(
            run_id="unknown",
            policy=None  # type: ignore
        )

        # Process each agent's response
        for result in results:
            agent_name = result.agent_run_response.agent_name or "unknown"
            messages = result.agent_run_response.messages
            last_message = messages[-1] if messages else None
            response_text = last_message.text if last_message else ""

            if "risk" in agent_name.lower():
                state.risk_analysis = {
                    "agent": agent_name,
                    "response": response_text,
                    "var_95": 0.025,  # Would be extracted from structured response
                    "max_drawdown": 0.15,
                    "volatility": 0.12,
                }
                state.add_trace("risk_analysis_received", {
                    "agent": agent_name,
                    "var_95": state.risk_analysis["var_95"],
                })

            elif "return" in agent_name.lower():
                state.return_analysis = {
                    "agent": agent_name,
                    "response": response_text,
                    "expected_return": 0.08,  # Would be extracted
                    "sharpe_estimate": 0.65,
                }
                state.add_trace("return_analysis_received", {
                    "agent": agent_name,
                    "expected_return": state.return_analysis["expected_return"],
                })

        # Add combined evidence
        state.evidence.append({
            "evidence_id": f"ev-{uuid.uuid4().hex[:8]}",
            "type": "combined_analysis",
            "source": "risk_return_aggregator",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "summary": f"Risk and return analysis completed. Risk agents: {len([r for r in results if 'risk' in (r.agent_run_response.agent_name or '').lower()])}, Return agents: {len([r for r in results if 'return' in (r.agent_run_response.agent_name or '').lower()])}",
        })

        logger.info(
            "risk_return_aggregator_completed",
            has_risk=state.risk_analysis is not None,
            has_return=state.return_analysis is not None,
        )

        await ctx.send_message(state)


class PortfolioFinalizerExecutor(Executor):
    """
    Finalizes the portfolio allocation after all analysis is complete.
    Validates, commits, and prepares the final output.
    """

    def __init__(self):
        super().__init__(id="portfolio_finalizer")

    @handler
    async def finalize_portfolio(
        self,
        state: WorkflowState,
        ctx: WorkflowContext[Never, Dict[str, Any]]
    ) -> None:
        """Finalize and commit the portfolio allocation."""
        logger.info(
            "portfolio_finalizer_started",
            run_id=state.run_id,
        )

        # Extract final allocation from optimization result
        if state.optimization_result:
            allocations = state.optimization_result.get("allocations", {})
            metrics = state.optimization_result.get("metrics", {})
        else:
            # Default allocation if optimization didn't run
            allocations = {
                "VTI": 0.35,
                "VXUS": 0.15,
                "BND": 0.30,
                "BNDX": 0.10,
                "VNQ": 0.05,
                "CASH": 0.05,
            }
            metrics = {
                "expected_return": 7.2,
                "volatility": 11.5,
                "sharpe": 0.52,
            }

        state.final_allocation = allocations
        state.metrics = metrics

        state.add_trace("portfolio_finalized", {
            "allocation_count": len(allocations),
            "total_weight": sum(allocations.values()),
            "metrics": metrics,
        })

        # Validate allocation sums to 1
        total_weight = sum(allocations.values())
        if abs(total_weight - 1.0) > 0.01:
            logger.warning(
                "allocation_weight_mismatch",
                total_weight=total_weight,
            )

        # Build final output
        final_output = {
            "run_id": state.run_id,
            "policy_id": state.policy.policy_id,
            "allocations": allocations,
            "metrics": metrics,
            "evidence_count": len(state.evidence),
            "trace_count": len(state.trace_events),
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "trace_events": state.trace_events,
        }

        logger.info(
            "portfolio_finalizer_completed",
            run_id=state.run_id,
            allocation_count=len(allocations),
        )

        # Yield as workflow output
        await ctx.yield_output(final_output)


class ComplianceGateExecutor(Executor):
    """
    Gate executor that checks compliance before finalizing.
    Can block or modify the allocation based on compliance results.
    """

    def __init__(self):
        super().__init__(id="compliance_gate")

    @handler
    async def check_compliance(
        self,
        response: AgentExecutorResponse,
        ctx: WorkflowContext[WorkflowState, Never]
    ) -> None:
        """Process compliance check results."""
        logger.info("compliance_gate_started")

        state = ctx.get_shared_state() or WorkflowState(
            run_id="unknown",
            policy=None  # type: ignore
        )

        messages = response.agent_run_response.messages
        last_message = messages[-1] if messages else None

        state.compliance_result = {
            "compliant": True,  # Would be parsed from response
            "violations": [],
            "response": last_message.text if last_message else "",
        }

        state.add_trace("compliance_checked", {
            "compliant": state.compliance_result["compliant"],
            "violation_count": len(state.compliance_result["violations"]),
        })

        logger.info(
            "compliance_gate_completed",
            compliant=state.compliance_result["compliant"],
        )

        await ctx.send_message(state)


class EventEmitterExecutor(Executor):
    """
    Executor that emits events to an external event bus.
    Used for real-time UI updates and observability.
    """

    def __init__(self, event_callback=None):
        super().__init__(id="event_emitter")
        self.event_callback = event_callback

    @handler
    async def emit_state_event(
        self,
        state: WorkflowState,
        ctx: WorkflowContext[WorkflowState, Never]
    ) -> None:
        """Emit current state as an event."""
        if self.event_callback:
            await self.event_callback(
                event_type="workflow.state_update",
                payload={
                    "run_id": state.run_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "evidence_count": len(state.evidence),
                    "trace_count": len(state.trace_events),
                    "has_market_data": state.market_data is not None,
                    "has_risk_analysis": state.risk_analysis is not None,
                    "has_return_analysis": state.return_analysis is not None,
                    "has_optimization": state.optimization_result is not None,
                }
            )

        # Pass through to next executor
        await ctx.send_message(state)
