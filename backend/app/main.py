"""
Emergency Payment Runbook - FastAPI Backend
Main application entry point with API endpoints.
"""

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse

from .config import get_settings, is_dry_run
from .logging_config import get_logger, setup_logging
from .orchestrator import get_orchestrator
from .schemas import (
    DecisionPacket,
    RunbookStartRequest,
    RunbookStartResponse,
    RunDetail,
    RunHistoryItem,
    RunStatus,
)
from .sse import get_sse_manager
from .storage import get_storage

# Initialize logging
setup_logging()
logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager."""
    settings = get_settings()
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")

    if is_dry_run():
        logger.warning("Running in DRY-RUN mode - agent responses will be stubbed")

    yield

    # Cleanup
    from .foundry_client import get_foundry_client
    await get_foundry_client().close()
    logger.info("Application shutdown complete")


# Create FastAPI app
app = FastAPI(
    title="Emergency Payment Runbook API",
    description="Multi-agent orchestration for emergency payment processing with sanctions screening, liquidity assessment, and operational procedure compliance.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Health Check
# =============================================================================

@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    settings = get_settings()
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.app_version,
        "dry_run_mode": is_dry_run(),
    }


# =============================================================================
# Runbook API
# =============================================================================

@app.post(
    "/api/runbook/start",
    response_model=RunbookStartResponse,
    tags=["Runbook"],
    summary="Start a new runbook workflow",
    description="Initiates a new emergency payment workflow. Returns a run_id to track progress via SSE.",
)
async def start_runbook(
    request: RunbookStartRequest,
    background_tasks: BackgroundTasks,
) -> RunbookStartResponse:
    """Start a new runbook workflow.

    The workflow will:
    1. Parse the payment request from the message
    2. Run sanctions screening
    3. Run liquidity screening (if sanctions pass)
    4. Run operational procedures
    5. Generate final decision

    Use GET /api/runbook/stream/{run_id} to receive real-time progress updates.
    """
    try:
        orchestrator = get_orchestrator()
        run_id = await orchestrator.start_workflow(request)

        # Execute workflow in background
        background_tasks.add_task(orchestrator.execute_workflow, run_id)

        logger.info(f"Workflow started: {run_id}")
        return RunbookStartResponse(run_id=run_id, status="started")

    except Exception as e:
        logger.error(f"Failed to start workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get(
    "/api/runbook/stream/{run_id}",
    tags=["Runbook"],
    summary="Stream workflow progress",
    description="Server-Sent Events stream for real-time workflow progress updates.",
)
async def stream_runbook(run_id: str) -> StreamingResponse:
    """Stream workflow progress via Server-Sent Events.

    Events are JSON objects with the following structure:
    ```json
    {
        "run_id": "...",
        "seq": 1,
        "type": "step_started|step_completed|agent_message|tool_call|kb_query|branch|error|final",
        "step": "intake|sanctions|liquidity|procedures|summarize",
        "agent": "...",
        "ts": "ISO8601",
        "elapsed_ms": 123,
        "payload": {...}
    }
    ```
    """
    sse_manager = get_sse_manager()

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            async for event in sse_manager.subscribe(run_id):
                yield event
        except asyncio.CancelledError:
            logger.debug(f"SSE stream cancelled for run: {run_id}")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get(
    "/api/runbook/result/{run_id}",
    response_model=DecisionPacket,
    tags=["Runbook"],
    summary="Get workflow result",
    description="Returns the final DecisionPacket for a completed workflow.",
)
async def get_runbook_result(run_id: str) -> DecisionPacket:
    """Get the final decision packet for a workflow run."""
    storage = get_storage()
    result = storage.get_decision(run_id)

    if not result:
        # Check if run exists
        run = storage.get_run(run_id)
        if not run:
            raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")

        if run.status == RunStatus.RUNNING:
            raise HTTPException(status_code=202, detail="Workflow still in progress")

        if run.status == RunStatus.FAILED:
            raise HTTPException(status_code=500, detail=f"Workflow failed: {run.error}")

        raise HTTPException(status_code=404, detail="Decision not available")

    return result


@app.get(
    "/api/runbook/runs",
    response_model=list[RunHistoryItem],
    tags=["Runbook"],
    summary="List workflow runs",
    description="Returns a paginated list of workflow runs.",
)
async def list_runs(
    limit: int = 50,
    offset: int = 0,
    status: str | None = None,
) -> list[RunHistoryItem]:
    """List workflow runs with optional filtering."""
    storage = get_storage()

    status_filter = None
    if status:
        try:
            status_filter = RunStatus(status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    return storage.list_runs(limit=limit, offset=offset, status=status_filter)


@app.get(
    "/api/runbook/run/{run_id}",
    response_model=RunDetail,
    tags=["Runbook"],
    summary="Get run details",
    description="Returns detailed information about a specific workflow run including all events.",
)
async def get_run_detail(run_id: str) -> RunDetail:
    """Get detailed information about a workflow run."""
    storage = get_storage()
    run = storage.get_run(run_id)

    if not run:
        raise HTTPException(status_code=404, detail=f"Run not found: {run_id}")

    return run


# =============================================================================
# Direct Agent Endpoints (for testing)
# =============================================================================

@app.post(
    "/api/agents/sanctions/screen",
    tags=["Agents"],
    summary="Direct sanctions screening",
    description="Directly invoke the sanctions screening agent without full workflow.",
)
async def direct_sanctions_screen(beneficiary_name: str):
    """Screen a beneficiary directly against sanctions list."""
    from .foundry_client import get_foundry_client
    from .logging_config import RunbookLogger
    import uuid

    run_id = f"direct-{uuid.uuid4().hex[:8]}"
    run_logger = RunbookLogger(run_id)

    try:
        client = get_foundry_client()
        result = await client.run_sanctions_screening(
            beneficiary_name=beneficiary_name,
            payment_context={"beneficiary_name": beneficiary_name},
            run_logger=run_logger,
        )
        return result.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post(
    "/api/agents/liquidity/check",
    tags=["Agents"],
    summary="Direct liquidity check",
    description="Directly invoke the liquidity screening agent without full workflow.",
)
async def direct_liquidity_check(
    amount: float,
    currency: str = "USD",
    entity: str = "BankSubsidiary_TR",
    account_id: str = "ACC-BAN-001",
):
    """Check liquidity impact directly."""
    from .foundry_client import get_foundry_client
    from .logging_config import RunbookLogger
    import uuid

    run_id = f"direct-{uuid.uuid4().hex[:8]}"
    run_logger = RunbookLogger(run_id)

    payment_context = {
        "amount": amount,
        "currency": currency,
        "entity": entity,
        "account_id": account_id,
    }

    try:
        client = get_foundry_client()
        result = await client.run_liquidity_screening(
            payment_context=payment_context,
            run_logger=run_logger,
        )
        return result.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Frontend Integration (Chat API)
# =============================================================================

@app.post("/api/chat", tags=["Chat"])
async def chat_endpoint(
    request: dict,
) -> StreamingResponse:
    """Chat endpoint for frontend integration.

    This endpoint provides a simplified interface that matches the frontend expectations.
    It starts a workflow and streams agent status updates via SSE.
    """
    message = request.get("message", "")
    payment_override = request.get("payment")

    # Build overrides from payment data
    overrides = {}
    if payment_override:
        overrides = {
            "payment_id": payment_override.get("payment_id"),
            "beneficiary_name": payment_override.get("beneficiary_name"),
            "amount": payment_override.get("amount"),
            "currency": payment_override.get("currency"),
            "entity": payment_override.get("entity"),
            "account_id": payment_override.get("account_id"),
        }

    # Create runbook request
    from .schemas import RunbookStartRequest, PaymentOverrides

    runbook_request = RunbookStartRequest(
        message=message,
        overrides=PaymentOverrides(**{k: v for k, v in overrides.items() if v is not None}),
    )

    try:
        orchestrator = get_orchestrator()
        run_id = await orchestrator.start_workflow(runbook_request)

        # Get SSE manager before starting workflow
        sse_manager = get_sse_manager()

        async def event_generator() -> AsyncGenerator[str, None]:
            # Start workflow execution as a concurrent task
            # This allows events to be emitted while we stream them
            workflow_task = asyncio.create_task(orchestrator.execute_workflow(run_id))

            try:
                async for event in sse_manager.subscribe(run_id):
                    yield event
            except asyncio.CancelledError:
                workflow_task.cancel()
            finally:
                # Ensure workflow completes or is cancelled
                if not workflow_task.done():
                    try:
                        await workflow_task
                    except asyncio.CancelledError:
                        pass

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    except Exception as e:
        logger.error(f"Chat endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Main Entry Point
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
    )
