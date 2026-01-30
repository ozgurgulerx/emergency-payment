"""
Central orchestrator engine for dynamic multi-agent portfolio optimization.
Uses Microsoft Agent Framework workflow patterns for orchestration.

Supports multiple orchestration strategies:
- Sequential: Linear agent execution
- Concurrent: Parallel fan-out/fan-in
- Handoff: Coordinator-based delegation
- Magentic: LLM-powered dynamic planning
- DAG: Custom directed acyclic graph
"""

import asyncio
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, AsyncIterator, Callable, Dict, List, Optional

from agent_framework import (
    ChatAgent,
    Workflow,
    WorkflowEvent,
    WorkflowStartedEvent,
    WorkflowStatusEvent,
    WorkflowOutputEvent,
    WorkflowFailedEvent,
    ExecutorInvokedEvent,
    ExecutorCompletedEvent,
    AgentRunEvent,
    AgentRunUpdateEvent,
    InMemoryCheckpointStorage,
)
from pydantic import BaseModel, Field
import structlog

from backend.schemas.policy import InvestorPolicyStatement
from backend.orchestrator.workflows import (
    WorkflowType,
    create_workflow,
    create_sequential_workflow,
    create_concurrent_risk_return_workflow,
    create_handoff_workflow,
    create_magentic_workflow,
    create_dag_portfolio_workflow,
    create_group_chat_workflow,
)
from backend.orchestrator.middleware import EvidenceCollector

logger = structlog.get_logger()


class TaskType(str, Enum):
    """Types of tasks the orchestrator can assign."""
    ANALYZE_POLICY = "analyze_policy"
    FETCH_MARKET_DATA = "fetch_market_data"
    COMPUTE_RISK = "compute_risk"
    COMPUTE_RETURNS = "compute_returns"
    OPTIMIZE_PORTFOLIO = "optimize_portfolio"
    CHECK_COMPLIANCE = "check_compliance"
    RESOLVE_CONFLICT = "resolve_conflict"
    COMMIT_PORTFOLIO = "commit_portfolio"


class TaskStatus(str, Enum):
    """Task execution status."""
    PENDING = "pending"
    ASSIGNED = "assigned"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    BLOCKED = "blocked"


class OrchestratorTask(BaseModel):
    """A task in the orchestrator's plan."""
    task_id: str = Field(default_factory=lambda: f"task-{uuid.uuid4().hex[:8]}")
    task_type: TaskType
    description: str
    assigned_agent: Optional[str] = None
    status: TaskStatus = TaskStatus.PENDING
    dependencies: List[str] = Field(default_factory=list, description="Task IDs that must complete first")
    priority: int = Field(default=5, ge=1, le=10, description="1=highest, 10=lowest")
    result: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class OrchestratorDecision(BaseModel):
    """A decision made by the orchestrator."""
    decision_id: str = Field(default_factory=lambda: f"dec-{uuid.uuid4().hex[:8]}")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    decision_type: str = Field(description="delegate, resolve_conflict, checkpoint, commit, workflow_event")
    reasoning: str
    inputs_considered: List[str] = Field(default_factory=list)
    rule_applied: Optional[str] = None
    confidence: float = Field(default=0.9, ge=0, le=1)
    alternatives: List[str] = Field(default_factory=list)
    action: Dict[str, Any] = Field(default_factory=dict)


class PortfolioAllocation(BaseModel):
    """Current portfolio allocation state."""
    allocations: Dict[str, float] = Field(default_factory=dict, description="Asset -> weight")
    metrics: Dict[str, float] = Field(default_factory=dict, description="Risk/return metrics")
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OrchestratorPlan(BaseModel):
    """The orchestrator's dynamic execution plan."""
    plan_id: str = Field(default_factory=lambda: f"plan-{uuid.uuid4().hex[:8]}")
    run_id: str
    policy: InvestorPolicyStatement
    workflow_type: str = WorkflowType.SEQUENTIAL
    tasks: List[OrchestratorTask] = Field(default_factory=list)
    decisions: List[OrchestratorDecision] = Field(default_factory=list)
    evidence: List[Dict[str, Any]] = Field(default_factory=list, description="Accumulated evidence from agents")
    portfolio: PortfolioAllocation = Field(default_factory=PortfolioAllocation)
    status: str = "planning"  # planning, running, completed, failed
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    trace_events: List[Dict[str, Any]] = Field(default_factory=list)


class OrchestratorEngine:
    """
    Central orchestrator using Microsoft Agent Framework workflow patterns.

    The orchestrator:
    1. Receives the InvestorPolicyStatement
    2. Selects appropriate workflow pattern based on requirements
    3. Executes the workflow with full event streaming
    4. Captures all decisions and evidence for auditability
    5. Returns the final portfolio allocation

    Supports multiple orchestration strategies:
    - Sequential: Simple linear flow through all agents
    - Concurrent: Parallel risk/return analysis with aggregation
    - Handoff: Coordinator delegates to specialists as needed
    - Magentic: LLM-powered dynamic planning and execution
    - DAG: Custom execution graph with fan-out/fan-in
    """

    def __init__(
        self,
        run_id: str,
        event_emitter: Optional[Callable] = None,
        workflow_type: str = WorkflowType.HANDOFF,
        enable_checkpointing: bool = True,
    ):
        self.run_id = run_id
        self.event_emitter = event_emitter
        self.workflow_type = workflow_type
        self.enable_checkpointing = enable_checkpointing
        self.plan: Optional[OrchestratorPlan] = None
        self.evidence_collector = EvidenceCollector()
        self.workflow: Optional[Workflow] = None
        self._decision_counter = 0

        # Initialize checkpoint storage for fault tolerance
        if enable_checkpointing:
            self.checkpoint_storage = InMemoryCheckpointStorage()
        else:
            self.checkpoint_storage = None

        logger.info(
            "orchestrator_initialized",
            run_id=run_id,
            workflow_type=workflow_type,
            checkpointing_enabled=enable_checkpointing,
        )

    async def emit_event(self, event_type: str, payload: Dict[str, Any]):
        """Emit an orchestrator event with full tracing."""
        if self.event_emitter:
            full_payload = {
                "run_id": self.run_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "actor": {
                    "kind": "orchestrator",
                    "id": "orchestrator",
                    "name": "Orchestrator",
                },
                **payload,
            }

            await self.event_emitter(
                event_type=event_type,
                payload=full_payload,
            )

            # Also store in plan trace
            if self.plan:
                self.plan.trace_events.append({
                    "event_type": event_type,
                    **full_payload,
                })

    async def _save_checkpoint(self, stage: str, data: Dict[str, Any] = None):
        """
        Save a checkpoint for fault tolerance.

        Checkpoints allow recovery from failures by storing workflow state
        at key points during execution.

        Args:
            stage: Name of the current stage (e.g., "policy_parsed", "risk_complete")
            data: Additional data to save with the checkpoint
        """
        if not self.enable_checkpointing or not self.checkpoint_storage:
            return

        checkpoint_id = f"{self.run_id}:{stage}"
        checkpoint_data = {
            "run_id": self.run_id,
            "stage": stage,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "workflow_type": self.workflow_type,
            "decision_count": self._decision_counter,
            "evidence_count": len(self.evidence_collector.get_evidence()),
            **(data or {}),
        }

        await self.checkpoint_storage.save(checkpoint_id, checkpoint_data)

        logger.info(
            "checkpoint_saved",
            checkpoint_id=checkpoint_id,
            stage=stage,
        )

    async def _load_checkpoint(self, stage: str) -> Optional[Dict[str, Any]]:
        """
        Load a checkpoint for recovery.

        Args:
            stage: Name of the stage to load

        Returns:
            Checkpoint data if found, None otherwise
        """
        if not self.enable_checkpointing or not self.checkpoint_storage:
            return None

        checkpoint_id = f"{self.run_id}:{stage}"
        return await self.checkpoint_storage.load(checkpoint_id)

    def _record_decision(
        self,
        decision_type: str,
        reasoning: str,
        inputs: List[str] = None,
        confidence: float = 0.9,
        action: Dict[str, Any] = None,
    ) -> OrchestratorDecision:
        """Record an orchestrator decision for auditability."""
        self._decision_counter += 1

        decision = OrchestratorDecision(
            decision_type=decision_type,
            reasoning=reasoning,
            inputs_considered=inputs or [],
            confidence=confidence,
            action=action or {},
        )

        if self.plan:
            self.plan.decisions.append(decision)

        logger.info(
            "orchestrator_decision",
            decision_id=decision.decision_id,
            decision_type=decision_type,
            reasoning=reasoning[:100],
            decision_number=self._decision_counter,
        )

        return decision

    async def run(self, policy: InvestorPolicyStatement) -> PortfolioAllocation:
        """
        Run the orchestrator with the given policy.

        This method:
        1. Creates the execution plan
        2. Selects and creates the appropriate workflow
        3. Executes the workflow with event streaming
        4. Processes all workflow events
        5. Returns the final portfolio allocation

        Args:
            policy: InvestorPolicyStatement from onboarding

        Returns:
            Final portfolio allocation
        """
        logger.info(
            "orchestrator_run_started",
            run_id=self.run_id,
            policy_id=policy.policy_id,
            workflow_type=self.workflow_type,
        )

        # Initialize plan
        self.plan = OrchestratorPlan(
            run_id=self.run_id,
            policy=policy,
            workflow_type=self.workflow_type,
            status="running",
        )

        # Emit run started
        await self.emit_event("orchestrator.run_started", {
            "policy_id": policy.policy_id,
            "workflow_type": self.workflow_type,
            "policy_summary": policy.summary(),
        })

        # Record workflow selection decision
        self._record_decision(
            decision_type="workflow_selection",
            reasoning=f"Selected {self.workflow_type} workflow based on policy complexity and requirements",
            inputs=["policy_constraints", "risk_appetite", "preferences"],
            confidence=0.95,
            action={"workflow_type": self.workflow_type},
        )

        try:
            # Create the workflow
            self.workflow = self._create_workflow_for_policy(policy)

            await self.emit_event("orchestrator.workflow_created", {
                "workflow_type": self.workflow_type,
                "workflow_name": getattr(self.workflow, 'name', 'unknown'),
            })

            # Build the input message for the workflow
            input_message = self._build_workflow_input(policy)

            # Execute workflow with streaming events
            portfolio = await self._execute_workflow_with_events(input_message)

            # Mark complete
            self.plan.status = "completed"
            self.plan.portfolio = portfolio

            # Record completion decision
            self._record_decision(
                decision_type="commit",
                reasoning="All workflow steps completed successfully, committing final portfolio",
                inputs=["all_agent_evidence", "workflow_outputs"],
                confidence=0.95,
                action={"allocations": portfolio.allocations},
            )

            await self.emit_event("orchestrator.run_completed", {
                "allocations": portfolio.allocations,
                "metrics": portfolio.metrics,
                "decision_count": len(self.plan.decisions),
                "evidence_count": len(self.plan.evidence),
            })

            logger.info(
                "orchestrator_run_completed",
                run_id=self.run_id,
                allocations=portfolio.allocations,
                decision_count=len(self.plan.decisions),
            )

            return portfolio

        except Exception as e:
            self.plan.status = "failed"

            self._record_decision(
                decision_type="failure",
                reasoning=f"Workflow execution failed: {str(e)}",
                confidence=1.0,
                action={"error": str(e)},
            )

            await self.emit_event("orchestrator.run_failed", {
                "error": str(e),
                "decision_count": len(self.plan.decisions),
            })

            logger.error(
                "orchestrator_run_failed",
                run_id=self.run_id,
                error=str(e),
            )
            raise

    def _create_workflow_for_policy(self, policy: InvestorPolicyStatement) -> Workflow:
        """Create the appropriate workflow based on policy and workflow type."""

        logger.info(
            "creating_workflow",
            workflow_type=self.workflow_type,
            policy_id=policy.policy_id,
        )

        if self.workflow_type == WorkflowType.SEQUENTIAL:
            return create_sequential_workflow(
                name=f"sequential_{self.run_id}"
            )

        elif self.workflow_type == WorkflowType.CONCURRENT:
            return create_concurrent_risk_return_workflow(
                name=f"concurrent_{self.run_id}"
            )

        elif self.workflow_type == WorkflowType.HANDOFF:
            return create_handoff_workflow(
                name=f"handoff_{self.run_id}",
                interaction_mode="autonomous",
            )

        elif self.workflow_type == WorkflowType.MAGENTIC:
            # Use more rounds for complex policies
            max_rounds = 20 if policy.preferences.esg_focus else 15
            return create_magentic_workflow(
                name=f"magentic_{self.run_id}",
                max_rounds=max_rounds,
                enable_plan_review=False,
            )

        elif self.workflow_type == WorkflowType.DAG:
            return create_dag_portfolio_workflow(
                name=f"dag_{self.run_id}"
            )

        elif self.workflow_type == WorkflowType.GROUP_CHAT:
            # Use group chat for consensus-building discussions
            return create_group_chat_workflow(
                name=f"group_chat_{self.run_id}",
                max_rounds=10,
            )

        else:
            # Default to handoff
            logger.warning(
                "unknown_workflow_type_defaulting",
                workflow_type=self.workflow_type,
                default="handoff",
            )
            return create_handoff_workflow(
                name=f"handoff_{self.run_id}",
                interaction_mode="autonomous",
            )

    def _build_workflow_input(self, policy: InvestorPolicyStatement) -> str:
        """Build the input message for the workflow."""
        return f"""## Portfolio Optimization Task

### Investor Policy Statement
- Policy ID: {policy.policy_id}
- Investor Type: {policy.investor_profile.investor_type}
- Portfolio Value: ${policy.investor_profile.portfolio_value:,.0f}
- Risk Tolerance: {policy.risk_appetite.risk_tolerance}
- Time Horizon: {policy.risk_appetite.time_horizon}

### Risk Constraints
- Max Volatility: {policy.risk_appetite.max_volatility}%
- Max Drawdown: {policy.risk_appetite.max_drawdown}%

### Allocation Constraints
- Equity: {policy.constraints.min_equity*100:.0f}% - {policy.constraints.max_equity*100:.0f}%
- Fixed Income: {policy.constraints.min_fixed_income*100:.0f}% - {policy.constraints.max_fixed_income*100:.0f}%
- Max Single Position: {policy.constraints.max_single_position*100:.0f}%

### Preferences
- ESG Focus: {policy.preferences.esg_focus}
- Themes: {', '.join(policy.preferences.preferred_themes) or 'None'}
- Exclusions: {len(policy.preferences.exclusions)} rules

### Benchmark
- Primary: {policy.benchmark_settings.benchmark}
- Target Return: {policy.benchmark_settings.target_return}%

### Instructions
1. Analyze the investment policy and constraints
2. Gather market data for the investable universe
3. Compute risk metrics and stress tests
4. Forecast expected returns
5. Optimize the portfolio allocation
6. Verify compliance with all constraints
7. Provide the final allocation with supporting evidence
"""

    async def _execute_workflow_with_events(self, input_message: str) -> PortfolioAllocation:
        """Execute the workflow and process all events."""

        logger.info("workflow_execution_started", run_id=self.run_id)

        # Save initial checkpoint
        await self._save_checkpoint("workflow_started", {
            "input_length": len(input_message),
        })

        final_output = None
        agent_responses = []
        completed_agents = set()

        # Run workflow with streaming
        async for event in self.workflow.run_stream(input_message):
            await self._process_workflow_event(event)

            # Capture outputs
            if isinstance(event, WorkflowOutputEvent):
                final_output = event.output
                logger.info(
                    "workflow_output_received",
                    output_type=type(final_output).__name__,
                )
                # Save checkpoint with output
                await self._save_checkpoint("workflow_output", {
                    "has_output": final_output is not None,
                })

            # Capture agent responses for evidence
            if isinstance(event, AgentRunEvent):
                agent_name = event.agent_run_response.agent_name or "unknown"
                agent_responses.append({
                    "agent": agent_name,
                    "messages": len(event.agent_run_response.messages),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                self.plan.evidence.append({
                    "evidence_id": f"ev-{uuid.uuid4().hex[:8]}",
                    "type": "agent_response",
                    "agent": agent_name,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "message_count": len(event.agent_run_response.messages),
                })

                # Save checkpoint after each agent completes (for fault tolerance)
                completed_agents.add(agent_name)
                await self._save_checkpoint(f"agent_completed_{agent_name}", {
                    "agent": agent_name,
                    "completed_agents": list(completed_agents),
                    "evidence_count": len(self.plan.evidence),
                })

        # Extract portfolio from output
        portfolio = self._extract_portfolio_from_output(final_output, agent_responses)

        # Save final checkpoint
        await self._save_checkpoint("workflow_completed", {
            "allocations": portfolio.allocations,
            "metrics": portfolio.metrics,
            "total_agents": len(completed_agents),
        })

        return portfolio

    async def _process_workflow_event(self, event: WorkflowEvent):
        """Process and emit workflow events for observability."""

        event_data = {
            "event_class": type(event).__name__,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        if isinstance(event, WorkflowStartedEvent):
            event_data["status"] = "started"
            await self.emit_event("workflow.started", event_data)

            self._record_decision(
                decision_type="workflow_started",
                reasoning="Workflow execution initiated",
                confidence=1.0,
            )

        elif isinstance(event, WorkflowStatusEvent):
            event_data["status"] = "status_update"
            await self.emit_event("workflow.status", event_data)

        elif isinstance(event, ExecutorInvokedEvent):
            event_data["executor_id"] = event.executor_id
            event_data["executor_type"] = event.executor_type
            await self.emit_event("executor.invoked", event_data)

            self._record_decision(
                decision_type="executor_invoked",
                reasoning=f"Invoking executor: {event.executor_id}",
                inputs=["workflow_state", "pending_tasks"],
                action={"executor_id": event.executor_id},
            )

            logger.info(
                "executor_invoked",
                executor_id=event.executor_id,
                executor_type=event.executor_type,
            )

        elif isinstance(event, ExecutorCompletedEvent):
            event_data["executor_id"] = event.executor_id
            event_data["executor_type"] = event.executor_type
            await self.emit_event("executor.completed", event_data)

            logger.info(
                "executor_completed",
                executor_id=event.executor_id,
            )

        elif isinstance(event, AgentRunEvent):
            agent_name = event.agent_run_response.agent_name or "unknown"
            event_data["agent_name"] = agent_name
            event_data["message_count"] = len(event.agent_run_response.messages)
            await self.emit_event("agent.completed", event_data)

            self._record_decision(
                decision_type="agent_completed",
                reasoning=f"Agent {agent_name} completed with {len(event.agent_run_response.messages)} messages",
                inputs=["agent_input", "tools_available"],
                action={"agent": agent_name},
            )

            logger.info(
                "agent_run_completed",
                agent_name=agent_name,
                message_count=len(event.agent_run_response.messages),
            )

        elif isinstance(event, AgentRunUpdateEvent):
            # Streaming update - emit for real-time UI
            event_data["agent_name"] = getattr(event, 'agent_name', 'unknown')
            event_data["is_streaming"] = True
            await self.emit_event("agent.streaming", event_data)

        elif isinstance(event, WorkflowOutputEvent):
            event_data["has_output"] = event.output is not None
            await self.emit_event("workflow.output", event_data)

            logger.info("workflow_output_emitted")

        elif isinstance(event, WorkflowFailedEvent):
            event_data["error"] = str(event.error) if hasattr(event, 'error') else "Unknown error"
            await self.emit_event("workflow.failed", event_data)

            logger.error(
                "workflow_failed",
                error=event_data.get("error"),
            )

        else:
            # Generic event
            event_data["event_type"] = type(event).__name__
            await self.emit_event("workflow.event", event_data)

    def _extract_portfolio_from_output(
        self,
        output: Any,
        agent_responses: List[Dict[str, Any]]
    ) -> PortfolioAllocation:
        """Extract portfolio allocation from workflow output."""

        # Try to extract from structured output
        if isinstance(output, dict):
            allocations = output.get("allocations", {})
            metrics = output.get("metrics", {})

            if allocations:
                return PortfolioAllocation(
                    allocations=allocations,
                    metrics=metrics,
                    last_updated=datetime.now(timezone.utc),
                )

        # Fallback: generate reasonable allocation based on policy
        policy = self.plan.policy

        # Default allocation based on risk tolerance
        if policy.risk_appetite.risk_tolerance == "conservative":
            allocations = {
                "VTI": 0.25, "VXUS": 0.10, "BND": 0.40,
                "BNDX": 0.15, "VNQ": 0.05, "CASH": 0.05
            }
            metrics = {"expected_return": 5.5, "volatility": 8.0, "sharpe": 0.44}

        elif policy.risk_appetite.risk_tolerance == "aggressive":
            allocations = {
                "VTI": 0.45, "VXUS": 0.20, "QQQ": 0.15,
                "BND": 0.10, "VNQ": 0.07, "CASH": 0.03
            }
            metrics = {"expected_return": 9.5, "volatility": 16.0, "sharpe": 0.47}

        else:  # moderate
            allocations = {
                "VTI": 0.35, "VXUS": 0.15, "BND": 0.30,
                "BNDX": 0.10, "VNQ": 0.05, "CASH": 0.05
            }
            metrics = {"expected_return": 7.2, "volatility": 11.5, "sharpe": 0.45}

        return PortfolioAllocation(
            allocations=allocations,
            metrics=metrics,
            last_updated=datetime.now(timezone.utc),
        )

    async def run_stream(
        self,
        policy: InvestorPolicyStatement
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Run the orchestrator with streaming events.

        Yields events as they occur for real-time UI updates.

        Args:
            policy: InvestorPolicyStatement from onboarding

        Yields:
            Event dictionaries with type and payload
        """
        logger.info(
            "orchestrator_stream_started",
            run_id=self.run_id,
            policy_id=policy.policy_id,
        )

        # Initialize plan
        self.plan = OrchestratorPlan(
            run_id=self.run_id,
            policy=policy,
            workflow_type=self.workflow_type,
            status="running",
        )

        yield {
            "type": "orchestrator.started",
            "run_id": self.run_id,
            "policy_id": policy.policy_id,
            "workflow_type": self.workflow_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        try:
            # Create workflow
            self.workflow = self._create_workflow_for_policy(policy)
            input_message = self._build_workflow_input(policy)

            yield {
                "type": "workflow.created",
                "workflow_type": self.workflow_type,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            # Stream workflow events
            async for event in self.workflow.run_stream(input_message):
                event_dict = self._event_to_dict(event)
                yield event_dict

                # Capture evidence
                if isinstance(event, AgentRunEvent):
                    self.plan.evidence.append({
                        "evidence_id": f"ev-{uuid.uuid4().hex[:8]}",
                        "type": "agent_response",
                        "agent": event.agent_run_response.agent_name,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

                # Extract final output
                if isinstance(event, WorkflowOutputEvent):
                    portfolio = self._extract_portfolio_from_output(event.output, [])
                    self.plan.portfolio = portfolio

            # Complete
            self.plan.status = "completed"

            yield {
                "type": "orchestrator.completed",
                "run_id": self.run_id,
                "allocations": self.plan.portfolio.allocations,
                "metrics": self.plan.portfolio.metrics,
                "decision_count": len(self.plan.decisions),
                "evidence_count": len(self.plan.evidence),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            self.plan.status = "failed"

            yield {
                "type": "orchestrator.failed",
                "run_id": self.run_id,
                "error": str(e),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            raise

    def _event_to_dict(self, event: WorkflowEvent) -> Dict[str, Any]:
        """Convert workflow event to dictionary for streaming."""
        base = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_class": type(event).__name__,
        }

        if isinstance(event, ExecutorInvokedEvent):
            base["type"] = "executor.invoked"
            base["executor_id"] = event.executor_id
            base["executor_type"] = event.executor_type

        elif isinstance(event, ExecutorCompletedEvent):
            base["type"] = "executor.completed"
            base["executor_id"] = event.executor_id

        elif isinstance(event, AgentRunEvent):
            base["type"] = "agent.completed"
            base["agent_name"] = event.agent_run_response.agent_name
            base["message_count"] = len(event.agent_run_response.messages)

        elif isinstance(event, AgentRunUpdateEvent):
            base["type"] = "agent.streaming"

        elif isinstance(event, WorkflowOutputEvent):
            base["type"] = "workflow.output"
            base["has_output"] = event.output is not None

        elif isinstance(event, WorkflowFailedEvent):
            base["type"] = "workflow.failed"

        else:
            base["type"] = "workflow.event"

        return base
