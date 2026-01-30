"""
IC Autopilot API Server - FastAPI with SSE streaming.
Main entry point for the backend API.
"""

import os
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional
import structlog
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel

from schemas import WorkflowEvent, EventKind, RunStatus
from schemas.runs import RunMetadata
from services.event_bus import get_event_bus, close_event_bus
from services.artifact_store import get_artifact_store
from services.run_store import get_run_store

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - initialize and cleanup resources."""
    logger.info("starting_ic_autopilot_api")

    # Initialize services (lazy - will connect on first use)
    # Pre-warm connections can be added here if needed

    yield

    # Cleanup
    logger.info("shutting_down_ic_autopilot_api")
    await close_event_bus()


# Create FastAPI app
app = FastAPI(
    title="IC Autopilot API",
    description="Investment Committee Autopilot - Real-time workflow orchestration",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Request/Response Models
# ============================================================================

class StartRunRequest(BaseModel):
    """Request to start a new IC run."""
    mandate_id: str
    seed: Optional[int] = 42
    config: Optional[dict] = None


class StartRunResponse(BaseModel):
    """Response after starting a run."""
    run_id: str
    status: str
    message: str


class RunSummary(BaseModel):
    """Summary of a run for list views."""
    run_id: str
    status: str
    mandate_id: str
    created_at: datetime
    progress_pct: float
    current_stage: Optional[str]
    selected_candidate: Optional[str]


class OrchestratorRunResponse(BaseModel):
    """Response after starting an orchestrator run."""
    run_id: str
    status: str
    message: str
    policy_id: str


# ============================================================================
# Health & Info Endpoints
# ============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint for k8s probes."""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@app.get("/ready")
async def readiness_check():
    """Readiness check - verifies dependencies."""
    checks = {"api": True}

    try:
        event_bus = await get_event_bus()
        await event_bus.redis.ping()
        checks["redis"] = True
    except Exception as e:
        checks["redis"] = False
        logger.error("redis_health_check_failed", error=str(e))

    try:
        run_store = await get_run_store()
        async with run_store.pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        checks["postgres"] = True
    except Exception as e:
        checks["postgres"] = False
        logger.error("postgres_health_check_failed", error=str(e))

    all_healthy = all(checks.values())
    return JSONResponse(
        status_code=200 if all_healthy else 503,
        content={"ready": all_healthy, "checks": checks}
    )


# ============================================================================
# IC Run Endpoints
# ============================================================================

@app.post("/api/ic/run", response_model=StartRunResponse)
async def start_run(request: StartRunRequest, background_tasks: BackgroundTasks):
    """
    Start a new Investment Committee run.

    Creates the run record, initializes stages, and starts the workflow.
    Returns immediately with run_id - use SSE to track progress.
    """
    try:
        run_store = await get_run_store()

        # Create run
        run = await run_store.create_run(
            mandate_id=request.mandate_id,
            seed=request.seed,
            config=request.config,
        )

        # Start workflow in background
        background_tasks.add_task(execute_workflow, run.run_id)

        logger.info("run_started", run_id=run.run_id, mandate_id=request.mandate_id)

        return StartRunResponse(
            run_id=run.run_id,
            status="started",
            message=f"IC run started. Subscribe to /api/ic/runs/{run.run_id}/events for progress."
        )

    except Exception as e:
        logger.error("run_start_failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ic/runs/{run_id}")
async def get_run(run_id: str):
    """Get run status and metadata."""
    run_store = await get_run_store()
    run = await run_store.get_run(run_id)

    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    return run.model_dump()


@app.get("/api/ic/runs/{run_id}/events")
async def stream_events(request: Request, run_id: str, since: Optional[str] = None):
    """
    SSE endpoint for real-time workflow events.

    Streams events as they occur. Supports reconnection via 'since' parameter
    or Last-Event-ID header.
    """
    # Get last event ID from query param or header
    last_event_id = since or request.headers.get("Last-Event-ID")

    logger.info("sse_connection_started", run_id=run_id, last_event_id=last_event_id)

    async def event_generator():
        """Generate SSE events from Redis stream."""
        event_bus = await get_event_bus()

        try:
            async for event in event_bus.subscribe(run_id, last_event_id):
                # Check if client disconnected
                if await request.is_disconnected():
                    logger.info("sse_client_disconnected", run_id=run_id)
                    break

                yield {
                    "id": event.event_id,
                    "event": event.kind.value,
                    "data": event.to_sse_data(),
                    "retry": 5000,  # Retry in 5 seconds on disconnect
                }

        except asyncio.CancelledError:
            logger.info("sse_stream_cancelled", run_id=run_id)
        except Exception as e:
            logger.error("sse_stream_error", run_id=run_id, error=str(e))

    return EventSourceResponse(event_generator())


@app.get("/api/ic/runs/{run_id}/artifacts")
async def get_artifacts(run_id: str):
    """Get artifact index for a run."""
    artifact_store = await get_artifact_store()
    artifacts = await artifact_store.list_artifacts(run_id)

    return {
        "run_id": run_id,
        "artifacts": artifacts,
    }


@app.get("/api/ic/runs/{run_id}/artifacts/{artifact_type}")
async def get_artifact(run_id: str, artifact_type: str, version: Optional[int] = None):
    """Get a specific artifact."""
    artifact_store = await get_artifact_store()
    artifact = await artifact_store.load(run_id, artifact_type, version)

    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    return artifact


@app.get("/api/ic/runs/{run_id}/audit")
async def get_audit_log(run_id: str):
    """Get audit bundle for a run."""
    artifact_store = await get_artifact_store()
    bundle = await artifact_store.get_audit_bundle(run_id)

    return bundle


@app.get("/api/ic/runs")
async def list_runs(
    status: Optional[str] = None,
    mandate_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    """List IC runs with optional filters."""
    run_store = await get_run_store()

    status_enum = RunStatus(status) if status else None
    runs = await run_store.list_runs(status_enum, mandate_id, limit, offset)

    return {
        "runs": [RunSummary(
            run_id=r.run_id,
            status=r.status.value,
            mandate_id=r.mandate_id,
            created_at=r.created_at,
            progress_pct=r.progress_pct,
            current_stage=r.current_stage,
            selected_candidate=r.selected_candidate,
        ).model_dump() for r in runs],
        "count": len(runs),
        "limit": limit,
        "offset": offset,
    }


# ============================================================================
# Orchestrator Endpoints (NEW - Dynamic Multi-Agent System)
# ============================================================================

@app.post("/api/ic/policy", response_model=OrchestratorRunResponse)
async def start_orchestrator_run(
    policy: dict,
    background_tasks: BackgroundTasks,
    workflow_type: Optional[str] = "handoff",
):
    """
    Start a new orchestrator run with an Investor Policy Statement.

    Uses Microsoft Agent Framework workflow patterns for orchestration.

    Workflow Types:
    - sequential: Linear agent execution (Market → Risk → Return → Optimizer → Compliance)
    - concurrent: Parallel risk/return analysis with fan-out/fan-in aggregation
    - handoff: Coordinator delegates to specialist agents (default, recommended)
    - magentic: LLM-powered dynamic planning and execution
    - dag: Custom directed acyclic graph workflow

    Returns immediately with run_id - use SSE to track progress with full
    orchestrator decision visibility.
    """
    from schemas.policy import InvestorPolicyStatement
    import uuid

    # Validate workflow type
    valid_types = ["sequential", "concurrent", "handoff", "magentic", "dag", "group_chat"]
    if workflow_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid workflow_type. Must be one of: {', '.join(valid_types)}"
        )

    try:
        # Validate and parse policy
        ips = InvestorPolicyStatement.model_validate(policy)

        # Generate run ID with workflow type prefix
        run_id = f"{workflow_type[:3]}-{uuid.uuid4().hex[:8]}"

        # Store run metadata
        run_store = await get_run_store()
        await run_store.create_run(
            mandate_id=f"policy:{ips.policy_id}",
            seed=42,
            config={
                "orchestrator_mode": True,
                "policy_id": ips.policy_id,
                "workflow_type": workflow_type,
            },
        )

        # Start orchestrator in background with selected workflow type
        background_tasks.add_task(
            execute_orchestrator_workflow,
            run_id,
            ips,
            workflow_type,
        )

        logger.info(
            "orchestrator_run_started",
            run_id=run_id,
            policy_id=ips.policy_id,
            workflow_type=workflow_type,
            portfolio_value=ips.investor_profile.portfolio_value,
        )

        return OrchestratorRunResponse(
            run_id=run_id,
            status="started",
            message=f"Orchestrator run started with {workflow_type} workflow. Subscribe to /api/ic/runs/{run_id}/events for real-time progress.",
            policy_id=ips.policy_id,
        )

    except Exception as e:
        logger.error("orchestrator_start_failed", error=str(e), workflow_type=workflow_type)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ic/workflows")
async def get_workflow_types():
    """
    Get available orchestration workflow types.

    Returns information about each workflow pattern supported by the orchestrator.
    """
    return {
        "workflow_types": [
            {
                "id": "sequential",
                "name": "Sequential",
                "description": "Linear agent execution: Market → Risk → Return → Optimizer → Compliance",
                "use_case": "Simple, predictable workflows where each step depends on the previous",
                "agents_flow": ["market_agent", "risk_agent", "return_agent", "optimizer_agent", "compliance_agent"],
            },
            {
                "id": "concurrent",
                "name": "Concurrent (Fan-out/Fan-in)",
                "description": "Parallel risk and return analysis with aggregation",
                "use_case": "When risk and return analysis can run independently",
                "agents_flow": ["[risk_agent, return_agent] → aggregator"],
            },
            {
                "id": "handoff",
                "name": "Handoff (Recommended)",
                "description": "Coordinator delegates to specialist agents based on needs",
                "use_case": "Dynamic routing where a coordinator decides which specialist to invoke",
                "agents_flow": ["coordinator → [risk_agent | return_agent | optimizer_agent | compliance_agent]"],
                "is_default": True,
            },
            {
                "id": "magentic",
                "name": "Magentic-One",
                "description": "LLM-powered dynamic planning and execution with adaptive replanning",
                "use_case": "Complex tasks requiring dynamic planning and multi-round orchestration",
                "agents_flow": ["manager → dynamic agent selection based on plan"],
            },
            {
                "id": "dag",
                "name": "DAG (Directed Acyclic Graph)",
                "description": "Custom execution graph with fan-out from market to risk/return, then fan-in",
                "use_case": "Complex workflows with explicit parallel and sequential sections",
                "agents_flow": ["policy_parser → market → [risk, return] → aggregator → optimizer → compliance → finalizer"],
            },
            {
                "id": "group_chat",
                "name": "Group Chat (Consensus)",
                "description": "Multi-agent round-robin discussion for consensus building",
                "use_case": "When multiple perspectives needed for complex decisions requiring debate and consensus",
                "agents_flow": ["[risk_advisor, return_advisor, portfolio_architect, compliance_reviewer] → round-robin discussion → consensus"],
            },
        ],
        "default": "handoff",
    }


@app.get("/api/ic/policy/templates")
async def get_policy_templates():
    """Get predefined IPS templates for quick start."""
    from schemas.policy import (
        create_conservative_ips,
        create_balanced_ips,
        create_aggressive_ips,
    )

    return {
        "templates": [
            {
                "id": "conservative",
                "name": "Conservative",
                "description": "Low risk, capital preservation focus",
                "policy": create_conservative_ips().model_dump(),
            },
            {
                "id": "balanced",
                "name": "Balanced",
                "description": "Moderate risk, balanced growth",
                "policy": create_balanced_ips().model_dump(),
            },
            {
                "id": "aggressive",
                "name": "Aggressive Growth",
                "description": "Higher risk, growth focus",
                "policy": create_aggressive_ips().model_dump(),
            },
        ]
    }


@app.post("/api/ic/chat")
async def chat_with_advisor(message: dict):
    """
    Chat endpoint for natural language policy creation.

    Takes a user message and returns an updated policy suggestion.
    This powers the chat panel in the onboarding flow.
    """
    from schemas.policy import InvestorPolicyStatement, create_balanced_ips

    user_message = message.get("message", "")
    current_policy = message.get("current_policy")

    # Start with current policy or default
    if current_policy:
        ips = InvestorPolicyStatement.model_validate(current_policy)
    else:
        ips = create_balanced_ips()

    # Simple keyword-based policy updates (in production, use LLM)
    response_text = "I've updated your policy based on your input."
    updates = []

    user_lower = user_message.lower()

    # Risk tolerance keywords
    if any(word in user_lower for word in ["conservative", "safe", "low risk", "preserve"]):
        ips.risk_appetite.risk_tolerance = "conservative"
        ips.risk_appetite.max_volatility = 8.0
        ips.risk_appetite.max_drawdown = 10.0
        ips.constraints.max_equity = 0.4
        updates.append("Set conservative risk profile")
        response_text = "I've set your profile to conservative with lower equity exposure and tighter risk limits."

    elif any(word in user_lower for word in ["aggressive", "growth", "high return"]):
        ips.risk_appetite.risk_tolerance = "aggressive"
        ips.risk_appetite.max_volatility = 20.0
        ips.risk_appetite.max_drawdown = 25.0
        ips.constraints.max_equity = 0.9
        updates.append("Set aggressive risk profile")
        response_text = "I've set your profile to aggressive growth with higher equity allocation."

    # Portfolio value keywords
    import re
    value_match = re.search(r'\$?([\d,]+(?:\.\d+)?)\s*(?:million|m|k)?', user_lower)
    if value_match:
        value_str = value_match.group(1).replace(',', '')
        value = float(value_str)
        if 'million' in user_lower or 'm' in user_lower.split():
            value *= 1_000_000
        elif 'k' in user_lower.split():
            value *= 1_000
        if value >= 10000:
            ips.investor_profile.portfolio_value = value
            updates.append(f"Set portfolio value to ${value:,.0f}")

    # Exclusion keywords
    if any(word in user_lower for word in ["no tobacco", "exclude tobacco", "tobacco free"]):
        from schemas.policy import ExclusionRule
        ips.preferences.exclusions.append(
            ExclusionRule(type="sector", value="Tobacco", reason="User preference")
        )
        updates.append("Added tobacco exclusion")
        response_text = "I've added tobacco to your exclusion list."

    if any(word in user_lower for word in ["esg", "sustainable", "green", "responsible"]):
        ips.preferences.esg_focus = True
        ips.preferences.min_esg_score = 60
        updates.append("Enabled ESG screening")
        response_text = "I've enabled ESG screening for your portfolio."

    # Theme keywords
    if "ai" in user_lower or "artificial intelligence" in user_lower:
        if "AI" not in ips.preferences.preferred_themes:
            ips.preferences.preferred_themes.append("AI")
        updates.append("Added AI theme")

    if "technology" in user_lower or "tech" in user_lower:
        if "Technology" not in ips.preferences.preferred_themes:
            ips.preferences.preferred_themes.append("Technology")
        updates.append("Added Technology theme")

    return {
        "response": response_text,
        "updates": updates,
        "policy": ips.model_dump(),
        "summary": ips.summary(),
    }


# ============================================================================
# Workflow Execution (Background Task)
# ============================================================================

async def execute_workflow(run_id: str):
    """
    Execute the IC workflow for a run.
    This is called as a background task and emits events via Redis.
    """
    from worker.workflow import ICWorkflow

    logger.info("workflow_execution_started", run_id=run_id)

    try:
        run_store = await get_run_store()
        event_bus = await get_event_bus()
        artifact_store = await get_artifact_store()

        # Update run status
        await run_store.update_run_status(run_id, RunStatus.RUNNING)

        # Emit run started event
        await event_bus.publish(WorkflowEvent(
            run_id=run_id,
            kind=EventKind.RUN_STARTED,
            message="IC Autopilot run started",
        ))

        # Execute workflow
        workflow = ICWorkflow(run_id, run_store, event_bus, artifact_store)
        await workflow.execute()

        # Update run status
        await run_store.update_run_status(run_id, RunStatus.COMPLETED)

        # Emit run completed event
        await event_bus.publish(WorkflowEvent(
            run_id=run_id,
            kind=EventKind.RUN_COMPLETED,
            message="IC Autopilot run completed successfully",
        ))

        logger.info("workflow_execution_completed", run_id=run_id)

    except Exception as e:
        logger.error("workflow_execution_failed", run_id=run_id, error=str(e))

        try:
            await run_store.update_run_status(
                run_id, RunStatus.FAILED, error_message=str(e)
            )
            await event_bus.publish(WorkflowEvent(
                run_id=run_id,
                kind=EventKind.RUN_FAILED,
                level="error",
                message=f"Run failed: {str(e)}",
            ))
        except Exception:
            pass


async def execute_orchestrator_workflow(run_id: str, policy, workflow_type: str = "handoff"):
    """
    Execute the orchestrator-based workflow using Agent Framework patterns.

    Supports multiple orchestration strategies:
    - sequential: Linear agent execution (Market → Risk → Return → Optimizer → Compliance)
    - concurrent: Parallel risk/return analysis with fan-out/fan-in
    - handoff: Coordinator delegates to specialist agents (default)
    - magentic: LLM-powered dynamic planning and execution
    - dag: Custom directed acyclic graph workflow

    Args:
        run_id: Unique identifier for this run
        policy: InvestorPolicyStatement from onboarding
        workflow_type: Orchestration pattern to use (default: "handoff")
    """
    from backend.orchestrator.engine import OrchestratorEngine
    from backend.orchestrator.workflows import WorkflowType

    logger.info(
        "orchestrator_workflow_started",
        run_id=run_id,
        policy_id=policy.policy_id,
        workflow_type=workflow_type,
    )

    run_store = None
    event_bus = None

    try:
        run_store = await get_run_store()
        event_bus = await get_event_bus()

        # Update run status
        await run_store.update_run_status(run_id, RunStatus.RUNNING)

        # Create event emitter callback for real-time updates
        async def emit_event(event_type: str, payload: dict):
            """Emit events to Redis for SSE streaming."""
            # Map workflow events to our event kinds
            event_kind = EventKind.PROGRESS_UPDATE
            if "started" in event_type:
                event_kind = EventKind.RUN_STARTED
            elif "completed" in event_type:
                event_kind = EventKind.RUN_COMPLETED
            elif "failed" in event_type:
                event_kind = EventKind.RUN_FAILED

            await event_bus.publish(WorkflowEvent(
                run_id=run_id,
                kind=event_kind,
                message=payload.get("reasoning", payload.get("summary", str(event_type))),
                payload={
                    "event_type": event_type,
                    "workflow_type": workflow_type,
                    **payload,
                },
            ))

        # Emit run started with workflow type
        await event_bus.publish(WorkflowEvent(
            run_id=run_id,
            kind=EventKind.RUN_STARTED,
            message=f"Orchestrator started with {workflow_type} workflow pattern",
            payload={
                "policy_summary": policy.summary(),
                "workflow_type": workflow_type,
                "workflow_patterns": {
                    "sequential": "Linear agent execution",
                    "concurrent": "Parallel fan-out/fan-in",
                    "handoff": "Coordinator-based delegation",
                    "magentic": "LLM-powered dynamic planning",
                    "dag": "Custom execution graph",
                },
            },
        ))

        # Create orchestrator with selected workflow type
        orchestrator = OrchestratorEngine(
            run_id=run_id,
            event_emitter=emit_event,
            workflow_type=workflow_type,
        )

        # Run orchestrator - uses Agent Framework workflow patterns internally
        portfolio = await orchestrator.run(policy)

        # Update run status
        await run_store.update_run_status(run_id, RunStatus.COMPLETED)

        # Emit completion with portfolio and decision trace
        await event_bus.publish(WorkflowEvent(
            run_id=run_id,
            kind=EventKind.RUN_COMPLETED,
            message=f"Portfolio optimization completed using {workflow_type} workflow",
            payload={
                "allocations": portfolio.allocations,
                "metrics": portfolio.metrics,
                "workflow_type": workflow_type,
                "decision_count": len(orchestrator.plan.decisions) if orchestrator.plan else 0,
                "evidence_count": len(orchestrator.plan.evidence) if orchestrator.plan else 0,
            },
        ))

        logger.info(
            "orchestrator_workflow_completed",
            run_id=run_id,
            workflow_type=workflow_type,
            allocations=portfolio.allocations,
            decision_count=len(orchestrator.plan.decisions) if orchestrator.plan else 0,
        )

    except Exception as e:
        logger.error(
            "orchestrator_workflow_failed",
            run_id=run_id,
            workflow_type=workflow_type,
            error=str(e),
        )

        try:
            if run_store:
                await run_store.update_run_status(run_id, RunStatus.FAILED, error_message=str(e))
            if event_bus:
                await event_bus.publish(WorkflowEvent(
                    run_id=run_id,
                    kind=EventKind.RUN_FAILED,
                    level="error",
                    message=f"Orchestrator run failed: {str(e)}",
                    payload={
                        "error": str(e),
                        "workflow_type": workflow_type,
                    },
                ))
        except Exception:
            pass


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "5001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
