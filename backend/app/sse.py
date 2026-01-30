"""
Server-Sent Events (SSE) manager for the Emergency Payment Runbook.
Handles real-time streaming of workflow progress to clients.
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Optional
from collections import defaultdict

from .schemas import EventType, SSEEvent, WorkflowStep
from .storage import get_storage
from .logging_config import get_logger

logger = get_logger("sse")


class SSEManager:
    """Manages SSE event streams for workflow runs."""

    def __init__(self):
        """Initialize SSE manager."""
        # Queues for each run_id to stream events
        self._queues: dict[str, list[asyncio.Queue]] = defaultdict(list)
        # Sequence counters for each run
        self._sequences: dict[str, int] = defaultdict(int)
        # Start times for elapsed calculation
        self._start_times: dict[str, datetime] = {}
        # Lock for thread safety
        self._lock = asyncio.Lock()

    async def start_run(self, run_id: str) -> None:
        """Initialize tracking for a new run.

        Args:
            run_id: Unique run identifier
        """
        async with self._lock:
            self._sequences[run_id] = 0
            self._start_times[run_id] = datetime.now(timezone.utc)
            self._queues[run_id] = []
            logger.debug(f"SSE manager started tracking run: {run_id}")

    async def subscribe(self, run_id: str) -> AsyncGenerator[str, None]:
        """Subscribe to SSE events for a run.

        Args:
            run_id: Run identifier to subscribe to

        Yields:
            SSE formatted event strings
        """
        queue: asyncio.Queue = asyncio.Queue()

        async with self._lock:
            self._queues[run_id].append(queue)

        logger.debug(f"New SSE subscriber for run: {run_id}")

        try:
            while True:
                try:
                    # Wait for event with timeout for heartbeat
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)

                    if event is None:  # End signal
                        break

                    yield event

                except asyncio.TimeoutError:
                    # Send heartbeat to keep connection alive
                    yield ": heartbeat\n\n"

        finally:
            async with self._lock:
                if run_id in self._queues and queue in self._queues[run_id]:
                    self._queues[run_id].remove(queue)
            logger.debug(f"SSE subscriber disconnected from run: {run_id}")

    async def emit(
        self,
        run_id: str,
        event_type: EventType,
        step: WorkflowStep,
        agent: str,
        payload: Optional[dict[str, Any]] = None,
    ) -> SSEEvent:
        """Emit an SSE event to all subscribers.

        Args:
            run_id: Run identifier
            event_type: Type of event
            step: Current workflow step
            agent: Agent name or 'orchestrator'
            payload: Event payload data

        Returns:
            The emitted SSEEvent
        """
        async with self._lock:
            # Increment sequence
            self._sequences[run_id] += 1
            seq = self._sequences[run_id]

            # Calculate elapsed time
            start_time = self._start_times.get(run_id, datetime.now(timezone.utc))
            elapsed_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)

        # Create event
        event = SSEEvent(
            run_id=run_id,
            seq=seq,
            type=event_type,
            step=step,
            agent=agent,
            elapsed_ms=elapsed_ms,
            payload=payload or {},
        )

        # Persist event
        try:
            get_storage().save_event(event)
        except Exception as e:
            logger.warning(f"Failed to persist event: {e}")

        # Broadcast to subscribers
        sse_data = event.to_sse()

        async with self._lock:
            queues = self._queues.get(run_id, [])
            for queue in queues:
                try:
                    await queue.put(sse_data)
                except Exception as e:
                    logger.warning(f"Failed to enqueue event: {e}")

        logger.debug(f"Emitted event: {event_type.value} for run {run_id}")
        return event

    async def end_run(self, run_id: str) -> None:
        """Signal end of run to all subscribers.

        Args:
            run_id: Run identifier
        """
        async with self._lock:
            queues = self._queues.get(run_id, [])
            for queue in queues:
                try:
                    await queue.put(None)  # End signal
                except Exception:
                    pass

            # Cleanup
            if run_id in self._queues:
                del self._queues[run_id]
            if run_id in self._sequences:
                del self._sequences[run_id]
            if run_id in self._start_times:
                del self._start_times[run_id]

        logger.debug(f"SSE manager ended run: {run_id}")

    # =========================================================================
    # Convenience Methods for Common Events
    # =========================================================================

    async def step_started(
        self,
        run_id: str,
        step: WorkflowStep,
        agent: str = "orchestrator",
        details: Optional[dict[str, Any]] = None,
    ) -> SSEEvent:
        """Emit step started event.

        Args:
            run_id: Run identifier
            step: Workflow step starting
            agent: Agent handling the step
            details: Additional details

        Returns:
            Emitted event
        """
        payload = {"message": f"Starting {step.value}"}
        if details:
            payload["details"] = details

        return await self.emit(
            run_id=run_id,
            event_type=EventType.STEP_STARTED,
            step=step,
            agent=agent,
            payload=payload,
        )

    async def step_completed(
        self,
        run_id: str,
        step: WorkflowStep,
        agent: str = "orchestrator",
        result_summary: Optional[str] = None,
        result_data: Optional[dict[str, Any]] = None,
    ) -> SSEEvent:
        """Emit step completed event.

        Args:
            run_id: Run identifier
            step: Workflow step completed
            agent: Agent that handled the step
            result_summary: Brief summary of result
            result_data: Full result data

        Returns:
            Emitted event
        """
        payload = {"message": f"Completed {step.value}"}
        if result_summary:
            payload["summary"] = result_summary
        if result_data:
            payload["result"] = result_data

        return await self.emit(
            run_id=run_id,
            event_type=EventType.STEP_COMPLETED,
            step=step,
            agent=agent,
            payload=payload,
        )

    async def agent_message(
        self,
        run_id: str,
        step: WorkflowStep,
        agent: str,
        message: str,
        data: Optional[dict[str, Any]] = None,
    ) -> SSEEvent:
        """Emit agent message event.

        Args:
            run_id: Run identifier
            step: Current workflow step
            agent: Agent sending the message
            message: Message content
            data: Additional data

        Returns:
            Emitted event
        """
        payload = {"message": message}
        if data:
            payload["data"] = data

        return await self.emit(
            run_id=run_id,
            event_type=EventType.AGENT_MESSAGE,
            step=step,
            agent=agent,
            payload=payload,
        )

    async def tool_call(
        self,
        run_id: str,
        step: WorkflowStep,
        agent: str,
        tool_name: str,
        tool_run_id: Optional[str] = None,
        input_summary: Optional[str] = None,
        output_summary: Optional[str] = None,
    ) -> SSEEvent:
        """Emit tool call event.

        Args:
            run_id: Run identifier
            step: Current workflow step
            agent: Agent making the call
            tool_name: Name of tool being called
            tool_run_id: Unique ID for this tool invocation
            input_summary: Summary of input (redacted)
            output_summary: Summary of output (redacted)

        Returns:
            Emitted event
        """
        payload = {"tool": tool_name}
        if tool_run_id:
            payload["tool_run_id"] = tool_run_id
        if input_summary:
            payload["input"] = input_summary
        if output_summary:
            payload["output"] = output_summary

        return await self.emit(
            run_id=run_id,
            event_type=EventType.TOOL_CALL,
            step=step,
            agent=agent,
            payload=payload,
        )

    async def kb_query(
        self,
        run_id: str,
        step: WorkflowStep,
        agent: str,
        query: str,
        results_count: int,
        sources: Optional[list[str]] = None,
    ) -> SSEEvent:
        """Emit knowledge base query event.

        Args:
            run_id: Run identifier
            step: Current workflow step
            agent: Agent making the query
            query: Query text
            results_count: Number of results returned
            sources: List of source documents

        Returns:
            Emitted event
        """
        payload = {
            "query": query[:100] + "..." if len(query) > 100 else query,
            "results_count": results_count,
        }
        if sources:
            payload["sources"] = sources

        return await self.emit(
            run_id=run_id,
            event_type=EventType.KB_QUERY,
            step=step,
            agent=agent,
            payload=payload,
        )

    async def branch(
        self,
        run_id: str,
        step: WorkflowStep,
        condition: str,
        target: str,
        reason: Optional[str] = None,
    ) -> SSEEvent:
        """Emit workflow branch event.

        Args:
            run_id: Run identifier
            step: Current workflow step
            condition: Condition evaluated
            target: Branch target (e.g., 'stop', 'continue', step name)
            reason: Reason for branch decision

        Returns:
            Emitted event
        """
        payload = {
            "condition": condition,
            "target": target,
        }
        if reason:
            payload["reason"] = reason

        return await self.emit(
            run_id=run_id,
            event_type=EventType.BRANCH,
            step=step,
            agent="orchestrator",
            payload=payload,
        )

    async def error(
        self,
        run_id: str,
        step: WorkflowStep,
        agent: str,
        error_message: str,
        error_type: Optional[str] = None,
        recoverable: bool = False,
    ) -> SSEEvent:
        """Emit error event.

        Args:
            run_id: Run identifier
            step: Step where error occurred
            agent: Agent that encountered error
            error_message: Error description
            error_type: Type/class of error
            recoverable: Whether workflow can continue

        Returns:
            Emitted event
        """
        payload = {
            "error": error_message,
            "recoverable": recoverable,
        }
        if error_type:
            payload["error_type"] = error_type

        return await self.emit(
            run_id=run_id,
            event_type=EventType.ERROR,
            step=step,
            agent=agent,
            payload=payload,
        )

    async def agent_thinking(
        self,
        run_id: str,
        step: WorkflowStep,
        agent: str,
        thought: str,
        context: Optional[dict[str, Any]] = None,
    ) -> SSEEvent:
        """Emit agent thinking/reasoning event.

        Args:
            run_id: Run identifier
            step: Current workflow step
            agent: Agent doing the thinking
            thought: The agent's reasoning/thought
            context: Additional context data

        Returns:
            Emitted event
        """
        payload = {"thought": thought}
        if context:
            payload["context"] = context

        return await self.emit(
            run_id=run_id,
            event_type=EventType.AGENT_THINKING,
            step=step,
            agent=agent,
            payload=payload,
        )

    async def agent_finding(
        self,
        run_id: str,
        step: WorkflowStep,
        agent: str,
        finding_type: str,
        finding: str,
        severity: str = "info",
        details: Optional[dict[str, Any]] = None,
    ) -> SSEEvent:
        """Emit agent finding event.

        Args:
            run_id: Run identifier
            step: Current workflow step
            agent: Agent that made the finding
            finding_type: Type of finding (e.g., 'match', 'breach', 'violation')
            finding: Description of the finding
            severity: Severity level ('info', 'warning', 'critical')
            details: Additional finding details

        Returns:
            Emitted event
        """
        payload = {
            "finding_type": finding_type,
            "finding": finding,
            "severity": severity,
        }
        if details:
            payload["details"] = details

        return await self.emit(
            run_id=run_id,
            event_type=EventType.AGENT_FINDING,
            step=step,
            agent=agent,
            payload=payload,
        )

    async def agent_detail(
        self,
        run_id: str,
        step: WorkflowStep,
        agent: str,
        label: str,
        value: Any,
        category: str = "info",
    ) -> SSEEvent:
        """Emit agent detail event for additional context.

        Args:
            run_id: Run identifier
            step: Current workflow step
            agent: Agent providing the detail
            label: Label for the detail
            value: Value of the detail
            category: Category ('metric', 'threshold', 'comparison', 'info')

        Returns:
            Emitted event
        """
        payload = {
            "label": label,
            "value": value,
            "category": category,
        }

        return await self.emit(
            run_id=run_id,
            event_type=EventType.AGENT_DETAIL,
            step=step,
            agent=agent,
            payload=payload,
        )

    async def final(
        self,
        run_id: str,
        decision: str,
        summary: str,
        decision_packet: Optional[dict[str, Any]] = None,
    ) -> SSEEvent:
        """Emit final decision event.

        Args:
            run_id: Run identifier
            decision: Final decision (RELEASE, HOLD, etc.)
            summary: Decision summary
            decision_packet: Full decision packet

        Returns:
            Emitted event
        """
        payload = {
            "decision": decision,
            "summary": summary,
        }
        if decision_packet:
            payload["decision_packet"] = decision_packet

        return await self.emit(
            run_id=run_id,
            event_type=EventType.FINAL,
            step=WorkflowStep.SUMMARIZE,
            agent="orchestrator",
            payload=payload,
        )


# Singleton SSE manager instance
_sse_manager: Optional[SSEManager] = None


def get_sse_manager() -> SSEManager:
    """Get the SSE manager singleton instance."""
    global _sse_manager
    if _sse_manager is None:
        _sse_manager = SSEManager()
    return _sse_manager
