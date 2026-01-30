"""
Pydantic schemas for the Emergency Payment Runbook API.
Defines all request/response models and internal data structures.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field
import uuid


# =============================================================================
# Enums
# =============================================================================

class SanctionsDecision(str, Enum):
    """Sanctions screening decision outcomes."""
    BLOCK = "BLOCK"
    ESCALATE = "ESCALATE"
    CLEAR = "CLEAR"


class LiquidityDecision(str, Enum):
    """Liquidity screening decision outcomes."""
    BREACH = "BREACH"
    NO_BREACH = "NO_BREACH"


class FinalDecision(str, Enum):
    """Final workflow decision outcomes."""
    RELEASE = "RELEASE"
    HOLD = "HOLD"
    PARTIAL = "PARTIAL"
    ESCALATE = "ESCALATE"
    REJECT = "REJECT"


class WorkflowStep(str, Enum):
    """Workflow processing steps."""
    INTAKE = "intake"
    SANCTIONS = "sanctions"
    LIQUIDITY = "liquidity"
    PROCEDURES = "procedures"
    SUMMARIZE = "summarize"


class EventType(str, Enum):
    """SSE event types for workflow progress."""
    STEP_STARTED = "step_started"
    STEP_COMPLETED = "step_completed"
    AGENT_MESSAGE = "agent_message"
    AGENT_THINKING = "agent_thinking"  # Agent reasoning/analysis in progress
    AGENT_FINDING = "agent_finding"    # Specific finding from agent analysis
    AGENT_DETAIL = "agent_detail"      # Additional context/details
    TOOL_CALL = "tool_call"
    KB_QUERY = "kb_query"
    BRANCH = "branch"
    ERROR = "error"
    FINAL = "final"


class RunStatus(str, Enum):
    """Workflow run status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


# =============================================================================
# Request Models
# =============================================================================

class PaymentOverrides(BaseModel):
    """Optional overrides for payment request defaults."""
    entity: Optional[str] = None
    account_id: Optional[str] = None
    channel: Optional[str] = None
    payment_id: Optional[str] = None
    timestamp_utc: Optional[str] = None


class RunbookStartRequest(BaseModel):
    """Request to start a runbook workflow."""
    message: str = Field(..., description="User message describing the payment request")
    overrides: Optional[PaymentOverrides] = None


# =============================================================================
# Internal Data Models
# =============================================================================

class PaymentRequest(BaseModel):
    """Normalized payment request extracted from user message."""
    payment_id: str = Field(default_factory=lambda: f"TXN-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}")
    beneficiary_name: str = Field(..., description="Name of the payment beneficiary")
    amount: float = Field(..., gt=0, description="Payment amount")
    currency: str = Field(default="USD", description="Payment currency code")
    timestamp_utc: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    entity: str = Field(default="BankSubsidiary_TR", description="Originating entity")
    account_id: str = Field(default="ACC-BAN-001", description="Source account ID")
    channel: str = Field(default="SWIFT", description="Payment channel")
    freeform_notes: Optional[str] = Field(default=None, description="Additional notes")


class Citation(BaseModel):
    """Citation reference from agent responses."""
    source: str = Field(..., description="Source document or system")
    snippet: str = Field(..., description="Relevant text snippet")
    reference: str = Field(..., description="Reference identifier or URL")


class ApprovalRequired(BaseModel):
    """Required approval for payment processing."""
    role: str = Field(..., description="Approver role")
    authority: str = Field(..., description="What they are authorized to approve")
    sla_hours: int = Field(..., description="SLA for approval in hours")


class WorkflowStepChecklist(BaseModel):
    """Checklist item for procedure steps."""
    step_number: int
    action: str
    responsible: str
    documentation_required: str


# =============================================================================
# Agent Output Models
# =============================================================================

class SanctionsResult(BaseModel):
    """Output from sanctions screening agent."""
    agent: str = "sanctions_screening"
    beneficiary_screened: str
    decision: SanctionsDecision
    confidence: int = Field(..., ge=0, le=100)
    match_type: str
    match_details: Optional[dict[str, Any]] = None
    recommendation: str
    pass_to_next_agent: bool
    tool_run_id: Optional[str] = None
    audit: dict[str, Any] = Field(default_factory=dict)


class LiquidityResult(BaseModel):
    """Output from liquidity screening agent."""
    agent: str = "liquidity_screening"
    payment_assessed: dict[str, Any]
    breach_assessment: dict[str, Any]
    account_summary: dict[str, Any]
    recommendation: dict[str, Any]
    pass_to_next_agent: bool
    tool_run_id: Optional[str] = None
    audit: dict[str, Any] = Field(default_factory=dict)


class ProceduresResult(BaseModel):
    """Output from operational procedures agent."""
    agent: str = "operational_procedures"
    input_summary: dict[str, Any]
    workflow_determination: dict[str, Any]
    required_approvals: list[ApprovalRequired]
    workflow_steps: list[WorkflowStepChecklist]
    audit_bundle: dict[str, Any]
    escalation_contacts: dict[str, str]
    citations: list[Citation] = Field(default_factory=list)
    tool_run_id: Optional[str] = None
    audit: dict[str, Any] = Field(default_factory=dict)


# =============================================================================
# Response Models
# =============================================================================

class RunbookStartResponse(BaseModel):
    """Response when starting a runbook workflow."""
    run_id: str
    status: str = "started"


class SSEEvent(BaseModel):
    """Server-Sent Event structure for workflow progress."""
    run_id: str
    seq: int
    type: EventType
    step: WorkflowStep
    agent: str
    ts: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    elapsed_ms: int = 0
    payload: dict[str, Any] = Field(default_factory=dict)

    def to_sse(self) -> str:
        """Convert to SSE data format."""
        import json
        return f"data: {json.dumps(self.model_dump())}\n\n"


class DecisionPacket(BaseModel):
    """Final decision packet from workflow processing."""
    run_id: str
    payment: PaymentRequest
    decision: FinalDecision
    rationale: list[str] = Field(default_factory=list)
    procedure_checklist: list[WorkflowStepChecklist] = Field(default_factory=list)
    approvals_required: list[ApprovalRequired] = Field(default_factory=list)
    sod_constraints: list[str] = Field(default_factory=list)
    cutoff_actions: list[str] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    audit_note: dict[str, Any] = Field(default_factory=dict)
    timestamps: dict[str, str] = Field(default_factory=dict)

    # Raw agent outputs for detailed inspection
    sanctions_result: Optional[SanctionsResult] = None
    liquidity_result: Optional[LiquidityResult] = None
    procedures_result: Optional[ProceduresResult] = None


class RunHistoryItem(BaseModel):
    """Summary item for run history listing."""
    run_id: str
    status: RunStatus
    decision: Optional[FinalDecision] = None
    beneficiary: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None


class RunDetail(BaseModel):
    """Detailed run information."""
    run_id: str
    status: RunStatus
    request_payload: dict[str, Any]
    decision_packet: Optional[DecisionPacket] = None
    events: list[SSEEvent] = Field(default_factory=list)
    created_at: str
    completed_at: Optional[str] = None
    error: Optional[str] = None
