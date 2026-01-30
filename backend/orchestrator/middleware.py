"""
Event emission middleware for Agent Framework agents.
Includes:
- Event emission wrapper for agent runs
- Evidence collection for auditability
- Context providers for injecting evidence into agent calls
"""

import uuid
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from agent_framework import ChatAgent, ContextProvider
import structlog

logger = structlog.get_logger()


class AgentEventEmitter:
    """
    Wrapper that adds event emission to ChatAgent runs.

    Since Agent Framework doesn't have built-in middleware like we need,
    we wrap agent.run() calls to emit events before and after execution.
    """

    def __init__(
        self,
        agent: ChatAgent,
        event_callback: Callable,
        run_id: str,
        agent_id: Optional[str] = None,
    ):
        """
        Initialize the event emitter wrapper.

        Args:
            agent: The ChatAgent to wrap
            event_callback: Async callback for emitting events
            run_id: The workflow run ID
            agent_id: Override agent ID (defaults to agent.name)
        """
        self.agent = agent
        self.event_callback = event_callback
        self.run_id = run_id
        self.agent_id = agent_id or getattr(agent, 'name', 'unknown_agent')
        self.evidence: List[Dict[str, Any]] = []
        self.reasoning_trace: List[str] = []

    async def _emit_event(self, event_type: str, payload: Dict[str, Any]):
        """Emit an event through the callback."""
        if self.event_callback:
            await self.event_callback(
                event_type=event_type,
                payload={
                    "run_id": self.run_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "agent_id": self.agent_id,
                    "agent_name": getattr(self.agent, 'name', self.agent_id),
                    **payload,
                }
            )

    async def run(self, message: str, **kwargs) -> str:
        """
        Run the agent with event emission.

        Args:
            message: The input message/objective for the agent
            **kwargs: Additional arguments to pass to agent.run()

        Returns:
            The agent's response text
        """
        started_at = datetime.utcnow()
        execution_id = f"exec-{uuid.uuid4().hex[:8]}"

        # Emit agent started event
        await self._emit_event("agent.status", {
            "execution_id": execution_id,
            "status": "running",
            "current_objective": message[:200],  # Truncate for readability
            "progress": 0.0,
        })

        try:
            # Run the agent
            response = await self.agent.run(message, **kwargs)
            response_text = str(response)

            completed_at = datetime.utcnow()
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)

            # Extract evidence from response (simplified - in production parse structured output)
            evidence = self._extract_evidence(response_text, message)
            self.evidence.extend(evidence)

            # Emit evidence events
            for ev in evidence:
                await self._emit_event("agent.evidence", {
                    "execution_id": execution_id,
                    "evidence": ev,
                })

            # Emit agent completed event
            await self._emit_event("agent.status", {
                "execution_id": execution_id,
                "status": "completed",
                "duration_ms": duration_ms,
                "progress": 1.0,
            })

            return response_text

        except Exception as e:
            # Emit agent failed event
            await self._emit_event("agent.status", {
                "execution_id": execution_id,
                "status": "failed",
                "error": str(e),
            })
            raise

    async def run_stream(self, message: str, **kwargs):
        """
        Run the agent with streaming and event emission.

        Args:
            message: The input message/objective for the agent
            **kwargs: Additional arguments to pass to agent.run_stream()

        Yields:
            Streamed response chunks
        """
        started_at = datetime.utcnow()
        execution_id = f"exec-{uuid.uuid4().hex[:8]}"

        # Emit agent started event
        await self._emit_event("agent.status", {
            "execution_id": execution_id,
            "status": "running",
            "current_objective": message[:200],
            "progress": 0.0,
        })

        try:
            full_response = []

            async for chunk in self.agent.run_stream(message, **kwargs):
                if hasattr(chunk, 'text') and chunk.text:
                    full_response.append(chunk.text)
                yield chunk

            completed_at = datetime.utcnow()
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)

            # Extract evidence from full response
            response_text = ''.join(full_response)
            evidence = self._extract_evidence(response_text, message)
            self.evidence.extend(evidence)

            for ev in evidence:
                await self._emit_event("agent.evidence", {
                    "execution_id": execution_id,
                    "evidence": ev,
                })

            # Emit agent completed event
            await self._emit_event("agent.status", {
                "execution_id": execution_id,
                "status": "completed",
                "duration_ms": duration_ms,
                "progress": 1.0,
            })

        except Exception as e:
            await self._emit_event("agent.status", {
                "execution_id": execution_id,
                "status": "failed",
                "error": str(e),
            })
            raise

    def _extract_evidence(self, response: str, objective: str) -> List[Dict[str, Any]]:
        """
        Extract evidence from agent response.

        This is a simplified implementation. In production, you would:
        - Use structured output from the agent
        - Parse specific evidence patterns
        - Extract tool call results
        """
        evidence = []

        # Create a summary evidence entry
        evidence.append({
            "evidence_id": f"ev-{uuid.uuid4().hex[:8]}",
            "agent_id": self.agent_id,
            "timestamp": datetime.utcnow().isoformat(),
            "type": "insight",
            "summary": f"Completed objective: {objective[:100]}",
            "details": {"response_length": len(response)},
            "confidence": 0.85,
            "source": self.agent_id,
        })

        return evidence


def wrap_agent_with_events(
    agent: ChatAgent,
    event_callback: Callable,
    run_id: str,
    agent_id: Optional[str] = None,
) -> AgentEventEmitter:
    """
    Wrap a ChatAgent with event emission capabilities.

    Args:
        agent: The ChatAgent to wrap
        event_callback: Async callback for emitting events
        run_id: The workflow run ID
        agent_id: Optional override for agent ID

    Returns:
        AgentEventEmitter wrapper that emits events during execution
    """
    return AgentEventEmitter(
        agent=agent,
        event_callback=event_callback,
        run_id=run_id,
        agent_id=agent_id,
    )


class EvidenceCollector:
    """
    Collects and aggregates evidence from multiple agents.
    Used by the orchestrator to maintain a global evidence store.
    """

    def __init__(self):
        self.evidence: List[Dict[str, Any]] = []

    def add_evidence(self, ev: Dict[str, Any]):
        """Add evidence to the collection."""
        self.evidence.append(ev)

    def get_evidence(self) -> List[Dict[str, Any]]:
        """Get all collected evidence."""
        return self.evidence.copy()

    def get_evidence_by_agent(self, agent_id: str) -> List[Dict[str, Any]]:
        """Get evidence from a specific agent."""
        return [ev for ev in self.evidence if ev.get("agent_id") == agent_id]

    def get_evidence_by_type(self, ev_type: str) -> List[Dict[str, Any]]:
        """Get evidence of a specific type."""
        return [ev for ev in self.evidence if ev.get("type") == ev_type]

    def clear(self):
        """Clear all evidence."""
        self.evidence = []


class EvidenceContextProvider(ContextProvider):
    """
    Context provider that injects accumulated evidence into agent calls.

    This allows agents to access evidence from previous agents in the workflow,
    enabling better decision-making based on prior analysis.

    Usage:
        collector = EvidenceCollector()
        provider = EvidenceContextProvider(collector)
        agent = ChatAgent(..., context_providers=[provider])

    The agent will receive evidence context in its system prompt.
    """

    def __init__(self, evidence_collector: EvidenceCollector, max_evidence: int = 10):
        """
        Initialize the evidence context provider.

        Args:
            evidence_collector: The evidence collector to pull evidence from
            max_evidence: Maximum number of evidence items to inject (to avoid context overflow)
        """
        self.evidence_collector = evidence_collector
        self.max_evidence = max_evidence

    async def invoking(self, messages: List[Any], **kwargs) -> Dict[str, Any]:
        """
        Called before agent invocation - inject evidence context.

        Returns additional instructions to be injected into the agent's context.
        """
        evidence = self.evidence_collector.get_evidence()

        if not evidence:
            return {}

        # Take most recent evidence up to max
        recent_evidence = evidence[-self.max_evidence:]

        # Format evidence as context
        evidence_text = "\n".join([
            f"- [{ev.get('type', 'unknown')}] {ev.get('summary', 'No summary')} "
            f"(from {ev.get('agent_id', 'unknown')}, confidence: {ev.get('confidence', 'N/A')})"
            for ev in recent_evidence
        ])

        additional_instructions = f"""
## Previous Analysis Evidence
The following evidence has been collected from previous agents in this workflow:

{evidence_text}

Consider this evidence when making your analysis and recommendations.
"""

        return {"instructions": additional_instructions}

    async def invoked(
        self,
        request_messages: List[Any],
        response_messages: List[Any],
        **kwargs
    ) -> None:
        """
        Called after agent invocation - extract new evidence from response.

        This can be used to automatically extract evidence from agent responses.
        """
        # Could be extended to automatically parse and extract evidence
        # from agent responses using structured output parsing
        pass


class WorkflowStateContextProvider(ContextProvider):
    """
    Context provider that injects workflow state into agent calls.

    Provides agents with information about:
    - Current workflow stage
    - Policy constraints and requirements
    - Previous agent results
    """

    def __init__(self, workflow_state: Optional[Dict[str, Any]] = None):
        """
        Initialize the workflow state context provider.

        Args:
            workflow_state: Initial workflow state dictionary
        """
        self.workflow_state = workflow_state or {}

    def update_state(self, key: str, value: Any):
        """Update a workflow state value."""
        self.workflow_state[key] = value

    def get_state(self) -> Dict[str, Any]:
        """Get current workflow state."""
        return self.workflow_state.copy()

    async def invoking(self, messages: List[Any], **kwargs) -> Dict[str, Any]:
        """Inject workflow state into agent context."""
        if not self.workflow_state:
            return {}

        state_summary = []

        # Include key workflow state elements
        if "policy_summary" in self.workflow_state:
            state_summary.append(f"Policy: {self.workflow_state['policy_summary']}")

        if "risk_tolerance" in self.workflow_state:
            state_summary.append(f"Risk Tolerance: {self.workflow_state['risk_tolerance']}")

        if "completed_stages" in self.workflow_state:
            stages = ", ".join(self.workflow_state["completed_stages"])
            state_summary.append(f"Completed Stages: {stages}")

        if "current_allocation" in self.workflow_state:
            state_summary.append(f"Current Allocation: {self.workflow_state['current_allocation']}")

        if not state_summary:
            return {}

        additional_instructions = f"""
## Workflow State
{chr(10).join(state_summary)}
"""

        return {"instructions": additional_instructions}

    async def invoked(
        self,
        request_messages: List[Any],
        response_messages: List[Any],
        **kwargs
    ) -> None:
        """Track workflow progress after agent invocation."""
        pass
