"""
Base agent class for LLM-powered agents with tool use.
Each agent has a status state machine and tool registry.
"""

import asyncio
import os
import uuid
from abc import ABC, abstractmethod
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, TypeVar
from pydantic import BaseModel, Field
import structlog

logger = structlog.get_logger()

# Azure OpenAI configuration
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT", "")
AZURE_OPENAI_KEY = os.getenv("AZURE_OPENAI_KEY", "")
AZURE_OPENAI_DEPLOYMENT = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview")


class AgentStatus(str, Enum):
    """Agent status state machine."""
    IDLE = "idle"
    QUEUED = "queued"
    RUNNING = "running"
    WAITING = "waiting"  # Waiting for external resource
    BLOCKED = "blocked"  # Blocked by another agent
    COMPLETED = "completed"
    FAILED = "failed"


class ToolDefinition(BaseModel):
    """Definition of an agent tool."""
    name: str
    description: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    handler: Optional[Callable] = Field(default=None, exclude=True)

    class Config:
        arbitrary_types_allowed = True


class Evidence(BaseModel):
    """Evidence collected by an agent during execution."""
    evidence_id: str = Field(default_factory=lambda: f"ev-{uuid.uuid4().hex[:8]}")
    agent_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    type: str = Field(description="Type of evidence: constraint, data, insight, warning")
    summary: str = Field(description="Short human-readable summary")
    details: Dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(default=0.9, ge=0, le=1)
    source: Optional[str] = Field(default=None, description="Data source or tool that produced this")


class AgentResult(BaseModel):
    """Result from an agent execution."""
    agent_id: str
    status: AgentStatus
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    objective: str
    evidence: List[Evidence] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    output_data: Dict[str, Any] = Field(default_factory=dict)
    error_message: Optional[str] = None
    reasoning_trace: List[str] = Field(default_factory=list, description="Step-by-step reasoning")


class BaseAgent(ABC):
    """
    Base class for LLM-powered agents.

    Each agent:
    - Has a unique identity and system prompt
    - Maintains a status state machine
    - Has a registry of tools it can call
    - Emits events for UI visibility
    - Collects evidence during execution
    """

    def __init__(
        self,
        agent_id: str,
        name: str,
        description: str,
        run_id: str,
        event_emitter: Optional[Callable] = None,
    ):
        self.agent_id = agent_id
        self.name = name
        self.description = description
        self.run_id = run_id
        self.event_emitter = event_emitter

        self.status = AgentStatus.IDLE
        self.current_objective: Optional[str] = None
        self.progress: float = 0.0
        self.tools: Dict[str, ToolDefinition] = {}
        self.evidence: List[Evidence] = []
        self.reasoning_trace: List[str] = []

        self._register_tools()

        logger.info(
            "agent_initialized",
            agent_id=self.agent_id,
            name=self.name,
            tools=list(self.tools.keys()),
        )

    @abstractmethod
    def _register_tools(self):
        """Register agent-specific tools. Override in subclasses."""
        pass

    @abstractmethod
    def get_system_prompt(self) -> str:
        """Get the agent's system prompt. Override in subclasses."""
        pass

    def register_tool(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any],
        handler: Callable,
    ):
        """Register a tool that this agent can use."""
        self.tools[name] = ToolDefinition(
            name=name,
            description=description,
            parameters=parameters,
            handler=handler,
        )

    async def set_status(self, status: AgentStatus, objective: Optional[str] = None):
        """Update agent status and emit event."""
        self.status = status
        if objective:
            self.current_objective = objective

        await self._emit_status_event()

    async def _emit_status_event(self):
        """Emit agent status event."""
        if self.event_emitter:
            await self.event_emitter(
                event_type="agent.status",
                payload={
                    "agent_id": self.agent_id,
                    "agent_name": self.name,
                    "status": self.status.value,
                    "current_objective": self.current_objective,
                    "progress": self.progress,
                }
            )

    async def add_evidence(
        self,
        type: str,
        summary: str,
        details: Dict[str, Any] = None,
        confidence: float = 0.9,
        source: Optional[str] = None,
    ) -> Evidence:
        """Add evidence collected during execution."""
        evidence = Evidence(
            agent_id=self.agent_id,
            type=type,
            summary=summary,
            details=details or {},
            confidence=confidence,
            source=source,
        )
        self.evidence.append(evidence)

        if self.event_emitter:
            await self.event_emitter(
                event_type="agent.evidence",
                payload={
                    "agent_id": self.agent_id,
                    "agent_name": self.name,
                    "evidence": evidence.model_dump(),
                }
            )

        logger.info(
            "agent_evidence_added",
            agent_id=self.agent_id,
            type=type,
            summary=summary,
        )

        return evidence

    async def add_reasoning(self, step: str):
        """Add a reasoning step to the trace."""
        self.reasoning_trace.append(step)

        if self.event_emitter:
            await self.event_emitter(
                event_type="agent.reasoning",
                payload={
                    "agent_id": self.agent_id,
                    "agent_name": self.name,
                    "step": step,
                    "step_number": len(self.reasoning_trace),
                }
            )

    async def call_tool(self, tool_name: str, **kwargs) -> Any:
        """Call a registered tool."""
        if tool_name not in self.tools:
            raise ValueError(f"Tool '{tool_name}' not registered for agent {self.name}")

        tool = self.tools[tool_name]
        if not tool.handler:
            raise ValueError(f"Tool '{tool_name}' has no handler")

        logger.info(
            "agent_tool_called",
            agent_id=self.agent_id,
            tool=tool_name,
            args=kwargs,
        )

        result = await tool.handler(**kwargs)

        return result

    async def execute(self, objective: str, context: Dict[str, Any]) -> AgentResult:
        """
        Execute the agent with a given objective.

        Args:
            objective: What the agent should accomplish
            context: Input data and context from orchestrator

        Returns:
            AgentResult with evidence, recommendations, and output data
        """
        started_at = datetime.utcnow()

        try:
            await self.set_status(AgentStatus.RUNNING, objective)

            # Execute agent-specific logic
            result_data = await self._execute_impl(objective, context)

            completed_at = datetime.utcnow()
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)

            await self.set_status(AgentStatus.COMPLETED)

            return AgentResult(
                agent_id=self.agent_id,
                status=AgentStatus.COMPLETED,
                started_at=started_at,
                completed_at=completed_at,
                duration_ms=duration_ms,
                objective=objective,
                evidence=self.evidence.copy(),
                recommendations=result_data.get("recommendations", []),
                output_data=result_data,
                reasoning_trace=self.reasoning_trace.copy(),
            )

        except Exception as e:
            logger.error(
                "agent_execution_failed",
                agent_id=self.agent_id,
                error=str(e),
            )

            await self.set_status(AgentStatus.FAILED)

            return AgentResult(
                agent_id=self.agent_id,
                status=AgentStatus.FAILED,
                started_at=started_at,
                completed_at=datetime.utcnow(),
                objective=objective,
                evidence=self.evidence.copy(),
                error_message=str(e),
                reasoning_trace=self.reasoning_trace.copy(),
            )

    @abstractmethod
    async def _execute_impl(self, objective: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Agent-specific execution logic. Override in subclasses.

        Returns:
            Dict with at least 'recommendations' key
        """
        pass

    def get_tools_schema(self) -> List[Dict[str, Any]]:
        """Get OpenAI-compatible tool schemas for this agent."""
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                }
            }
            for tool in self.tools.values()
        ]

    async def invoke_llm(
        self,
        messages: List[Dict[str, str]],
        use_tools: bool = True,
    ) -> Dict[str, Any]:
        """
        Invoke the LLM backend (Azure OpenAI).
        Returns the response with any tool calls.
        """
        try:
            from openai import AsyncAzureOpenAI

            client = AsyncAzureOpenAI(
                azure_endpoint=AZURE_OPENAI_ENDPOINT,
                api_key=AZURE_OPENAI_KEY,
                api_version=AZURE_OPENAI_API_VERSION,
            )

            kwargs = {
                "model": AZURE_OPENAI_DEPLOYMENT,
                "messages": [
                    {"role": "system", "content": self.get_system_prompt()},
                    *messages,
                ],
                "temperature": 0.3,
                "max_tokens": 4000,
            }

            if use_tools and self.tools:
                kwargs["tools"] = self.get_tools_schema()
                kwargs["tool_choice"] = "auto"

            response = await client.chat.completions.create(**kwargs)

            message = response.choices[0].message

            return {
                "content": message.content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    }
                    for tc in (message.tool_calls or [])
                ],
                "finish_reason": response.choices[0].finish_reason,
            }

        except ImportError:
            logger.warning("openai not installed, using mock response")
            return {
                "content": f"Mock response for {self.name}",
                "tool_calls": [],
                "finish_reason": "stop",
            }
        except Exception as e:
            logger.error("llm_invocation_failed", agent=self.name, error=str(e))
            raise


# Type variable for generic agent creation
T = TypeVar("T", bound=BaseAgent)
