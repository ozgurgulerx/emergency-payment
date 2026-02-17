"""
Custom Executors for Emergency Payment workflow using Agent Framework.

These executors wrap the Foundry agent calls and integrate with the
sequential workflow pattern from agent-framework.
"""

from datetime import datetime, timezone
from typing import Any, Optional
from typing_extensions import Never

from agent_framework import (
    Executor,
    WorkflowContext,
    handler,
)
from pydantic import BaseModel, Field
import structlog

from .foundry_client import FoundryAgentClient, get_foundry_client
from .logging_config import RunbookLogger
from .schemas import (
    DecisionPacket,
    FinalDecision,
    PaymentRequest,
    SanctionsDecision,
    SanctionsResult,
    LiquidityResult,
    ProceduresResult,
    WorkflowStep,
    WorkflowStepChecklist,
    ApprovalRequired,
    Citation,
)
from .sse import SSEManager, get_sse_manager

logger = structlog.get_logger()


# =============================================================================
# Workflow State
# =============================================================================

class EmergencyPaymentState(BaseModel):
    """Shared state passed through the emergency payment workflow."""
    run_id: str
    payment: PaymentRequest
    timestamps: dict[str, str] = Field(default_factory=dict)

    # Agent results (populated as workflow progresses)
    sanctions_result: Optional[SanctionsResult] = None
    liquidity_result: Optional[LiquidityResult] = None
    procedures_result: Optional[ProceduresResult] = None

    # Final output
    decision_packet: Optional[DecisionPacket] = None

    # Workflow control
    should_terminate_early: bool = False
    termination_reason: Optional[str] = None

    class Config:
        arbitrary_types_allowed = True


# =============================================================================
# Intake Executor
# =============================================================================

class IntakeExecutor(Executor):
    """
    Entry point executor that initializes the workflow state.
    Validates the payment request and prepares context for downstream agents.
    """

    def __init__(
        self,
        sse_manager: Optional[SSEManager] = None,
    ):
        super().__init__(id="intake_executor")
        self.sse_manager = sse_manager or get_sse_manager()

    @handler
    async def process_intake(
        self,
        state: EmergencyPaymentState,
        ctx: WorkflowContext[EmergencyPaymentState, Never],
    ) -> None:
        """Process payment intake and emit SSE events."""
        run_logger = RunbookLogger(state.run_id)

        logger.info(
            "intake_executor_started",
            run_id=state.run_id,
            payment_id=state.payment.payment_id,
            beneficiary=state.payment.beneficiary_name,
        )

        # Emit SSE event
        await self.sse_manager.step_started(state.run_id, WorkflowStep.INTAKE)
        run_logger.step_started("intake")

        # Build payment context
        payment_context = {
            "payment_id": state.payment.payment_id,
            "amount": state.payment.amount,
            "currency": state.payment.currency,
            "beneficiary_name": state.payment.beneficiary_name,
            "entity": state.payment.entity,
            "account_id": state.payment.account_id,
            "channel": state.payment.channel,
            "timestamp_utc": state.payment.timestamp_utc,
        }

        # Complete intake step
        await self.sse_manager.step_completed(
            state.run_id,
            WorkflowStep.INTAKE,
            result_summary=f"Payment ${state.payment.amount:,.2f} {state.payment.currency} to {state.payment.beneficiary_name}",
            result_data={"payment": payment_context},
        )
        run_logger.step_completed("intake", f"Parsed payment: {state.payment.payment_id}")

        state.timestamps["intake_completed"] = datetime.now(timezone.utc).isoformat()

        logger.info(
            "intake_executor_completed",
            run_id=state.run_id,
            payment_id=state.payment.payment_id,
        )

        # Pass state to next executor
        await ctx.send_message(state)


# =============================================================================
# Sanctions Executor
# =============================================================================

class SanctionsExecutor(Executor):
    """
    Executes sanctions screening via Foundry hosted agent.
    Can terminate workflow early if BLOCK decision is returned.
    """

    def __init__(
        self,
        foundry_client: Optional[FoundryAgentClient] = None,
        sse_manager: Optional[SSEManager] = None,
        agent_name: str = "sanctions-screening-agent",
    ):
        super().__init__(id="sanctions_executor")
        self.foundry_client = foundry_client or get_foundry_client()
        self.sse_manager = sse_manager or get_sse_manager()
        self.agent_name = agent_name

    @handler
    async def screen_sanctions(
        self,
        state: EmergencyPaymentState,
        ctx: WorkflowContext[EmergencyPaymentState, Never],
    ) -> None:
        """Run sanctions screening agent."""
        run_logger = RunbookLogger(state.run_id)

        logger.info(
            "sanctions_executor_started",
            run_id=state.run_id,
            beneficiary=state.payment.beneficiary_name,
        )

        # Emit SSE event
        await self.sse_manager.step_started(
            state.run_id,
            WorkflowStep.SANCTIONS,
            agent=self.agent_name,
        )
        run_logger.step_started("sanctions", self.agent_name)

        # Build payment context for agent
        payment_context = {
            "payment_id": state.payment.payment_id,
            "amount": state.payment.amount,
            "currency": state.payment.currency,
            "beneficiary_name": state.payment.beneficiary_name,
            "entity": state.payment.entity,
            "account_id": state.payment.account_id,
            "channel": state.payment.channel,
            "timestamp_utc": state.payment.timestamp_utc,
        }

        # Emit thinking trace BEFORE the agent call so the UI
        # shows the "thinking" animation while the agent works
        await self.sse_manager.agent_thinking(
            state.run_id,
            WorkflowStep.SANCTIONS,
            self.agent_name,
            f"Screening beneficiary '{state.payment.beneficiary_name}' against sanctions lists",
            context={"lists_checked": ["OFAC SDN", "EU Sanctions", "UN Sanctions"]},
        )
        await self.sse_manager.agent_detail(
            state.run_id, WorkflowStep.SANCTIONS, self.agent_name,
            "Beneficiary Name", state.payment.beneficiary_name, category="info",
        )

        # Call Foundry agent
        sanctions_result = await self.foundry_client.run_sanctions_screening(
            beneficiary_name=state.payment.beneficiary_name,
            payment_context=payment_context,
            run_logger=run_logger,
        )

        state.sanctions_result = sanctions_result

        # Emit detail traces (these depend on the result)
        await self.sse_manager.agent_detail(
            state.run_id, WorkflowStep.SANCTIONS, self.agent_name,
            "Match Type", sanctions_result.match_type, category="info",
        )
        await self.sse_manager.agent_detail(
            state.run_id, WorkflowStep.SANCTIONS, self.agent_name,
            "Confidence Score", f"{sanctions_result.confidence}%", category="metric",
        )

        # Emit finding based on decision
        match_details = sanctions_result.match_details or {}
        if sanctions_result.decision == SanctionsDecision.BLOCK:
            await self.sse_manager.agent_finding(
                state.run_id, WorkflowStep.SANCTIONS, self.agent_name,
                finding_type="sanctions_match",
                finding=f"BLOCKED: {sanctions_result.match_type} match found against SDN list",
                severity="critical",
                details={
                    "matched_entity": match_details.get("matched_entity", state.payment.beneficiary_name),
                    "programs": match_details.get("programs", []),
                    "confidence": sanctions_result.confidence,
                },
            )
        elif sanctions_result.decision == SanctionsDecision.ESCALATE:
            await self.sse_manager.agent_finding(
                state.run_id, WorkflowStep.SANCTIONS, self.agent_name,
                finding_type="potential_match",
                finding=f"Potential match requires manual review (confidence: {sanctions_result.confidence}%)",
                severity="warning",
                details={"recommendation": sanctions_result.recommendation},
            )
        else:
            await self.sse_manager.agent_finding(
                state.run_id, WorkflowStep.SANCTIONS, self.agent_name,
                finding_type="sanctions_clear",
                finding="No sanctions matches found - beneficiary cleared",
                severity="info",
                details={"confidence": sanctions_result.confidence},
            )

        # Emit tool call event
        await self.sse_manager.tool_call(
            state.run_id,
            WorkflowStep.SANCTIONS,
            self.agent_name,
            "screen_sanctions",
            tool_run_id=sanctions_result.tool_run_id,
            output_summary=f"{sanctions_result.decision.value} ({sanctions_result.confidence}%)",
        )

        # Build result summary
        result_summary = (
            f"{sanctions_result.decision.value} ({sanctions_result.confidence}%) | "
            f"{sanctions_result.recommendation[:60]}"
        )

        # Complete step
        await self.sse_manager.step_completed(
            state.run_id,
            WorkflowStep.SANCTIONS,
            agent=self.agent_name,
            result_summary=result_summary,
            result_data={
                "decision": sanctions_result.decision.value,
                "confidence": sanctions_result.confidence,
                "match_type": sanctions_result.match_type,
                "recommendation": sanctions_result.recommendation,
            },
        )
        run_logger.step_completed("sanctions", f"Decision: {sanctions_result.decision.value}")

        state.timestamps["sanctions_completed"] = datetime.now(timezone.utc).isoformat()

        # Check for BLOCK decision - mark for early termination
        if sanctions_result.decision == SanctionsDecision.BLOCK:
            await self.sse_manager.branch(
                state.run_id,
                WorkflowStep.SANCTIONS,
                "sanctions_decision == BLOCK",
                "TERMINATE",
                "Sanctions BLOCK requires immediate rejection",
            )
            run_logger.branch_taken("sanctions_decision == BLOCK", "TERMINATE")

            state.should_terminate_early = True
            state.termination_reason = "SANCTIONS_BLOCK"

        logger.info(
            "sanctions_executor_completed",
            run_id=state.run_id,
            decision=sanctions_result.decision.value,
            terminate_early=state.should_terminate_early,
        )

        await ctx.send_message(state)


# =============================================================================
# Liquidity Executor
# =============================================================================

class LiquidityExecutor(Executor):
    """
    Executes liquidity screening via Foundry hosted agent.
    Checks if payment would breach liquidity thresholds.
    """

    def __init__(
        self,
        foundry_client: Optional[FoundryAgentClient] = None,
        sse_manager: Optional[SSEManager] = None,
        agent_name: str = "liquidity-screening-agent",
    ):
        super().__init__(id="liquidity_executor")
        self.foundry_client = foundry_client or get_foundry_client()
        self.sse_manager = sse_manager or get_sse_manager()
        self.agent_name = agent_name

    @handler
    async def check_liquidity(
        self,
        state: EmergencyPaymentState,
        ctx: WorkflowContext[EmergencyPaymentState, Never],
    ) -> None:
        """Run liquidity screening agent."""
        run_logger = RunbookLogger(state.run_id)

        # Skip if workflow should terminate early
        if state.should_terminate_early:
            logger.info(
                "liquidity_executor_skipped",
                run_id=state.run_id,
                reason=state.termination_reason,
            )
            await ctx.send_message(state)
            return

        logger.info(
            "liquidity_executor_started",
            run_id=state.run_id,
            amount=state.payment.amount,
        )

        # Emit SSE event
        await self.sse_manager.step_started(
            state.run_id,
            WorkflowStep.LIQUIDITY,
            agent=self.agent_name,
        )
        run_logger.step_started("liquidity", self.agent_name)

        # Build payment context
        payment_context = {
            "payment_id": state.payment.payment_id,
            "amount": state.payment.amount,
            "currency": state.payment.currency,
            "beneficiary_name": state.payment.beneficiary_name,
            "entity": state.payment.entity,
            "account_id": state.payment.account_id,
            "channel": state.payment.channel,
            "timestamp_utc": state.payment.timestamp_utc,
        }

        # Emit thinking trace BEFORE the agent call so the UI
        # shows the "thinking" animation while the agent works
        await self.sse_manager.agent_thinking(
            state.run_id,
            WorkflowStep.LIQUIDITY,
            self.agent_name,
            f"Analyzing liquidity impact for {state.payment.currency} {state.payment.amount:,.2f} payment",
            context={"entity": state.payment.entity, "account": state.payment.account_id},
        )

        # Call Foundry agent
        liquidity_result = await self.foundry_client.run_liquidity_screening(
            payment_context=payment_context,
            run_logger=run_logger,
        )

        state.liquidity_result = liquidity_result

        breach_assessment = liquidity_result.breach_assessment or {}
        account_summary = liquidity_result.account_summary or {}
        breach = breach_assessment.get("breach", False)

        # Emit detail traces (these depend on the result)
        await self.sse_manager.agent_detail(
            state.run_id, WorkflowStep.LIQUIDITY, self.agent_name,
            "Start of Day Balance",
            f"${account_summary.get('start_of_day_balance', 0):,.2f}",
            category="metric",
        )
        await self.sse_manager.agent_detail(
            state.run_id, WorkflowStep.LIQUIDITY, self.agent_name,
            "Total Outflows Today",
            f"${account_summary.get('total_outflow', 0):,.2f}",
            category="metric",
        )
        await self.sse_manager.agent_detail(
            state.run_id, WorkflowStep.LIQUIDITY, self.agent_name,
            "Projected End of Day",
            f"${account_summary.get('end_of_day_balance', 0):,.2f}",
            category="metric",
        )

        buffer_threshold = breach_assessment.get("buffer_threshold", 0)
        projected_min = breach_assessment.get("projected_min_balance", 0)

        await self.sse_manager.agent_detail(
            state.run_id, WorkflowStep.LIQUIDITY, self.agent_name,
            "Buffer Threshold",
            f"${buffer_threshold:,.2f}",
            category="threshold",
        )
        await self.sse_manager.agent_detail(
            state.run_id, WorkflowStep.LIQUIDITY, self.agent_name,
            "Projected Minimum Balance",
            f"${projected_min:,.2f}",
            category="comparison",
        )

        # Emit finding based on breach status
        if breach:
            gap = breach_assessment.get("gap", 0)
            first_breach_time = breach_assessment.get("first_breach_time", "")
            await self.sse_manager.agent_finding(
                state.run_id, WorkflowStep.LIQUIDITY, self.agent_name,
                finding_type="liquidity_breach",
                finding=f"Payment would breach buffer threshold by ${gap:,.2f}",
                severity="critical",
                details={
                    "gap_amount": gap,
                    "breach_time": first_breach_time,
                    "buffer_threshold": buffer_threshold,
                    "projected_balance": projected_min,
                },
            )
        else:
            headroom = breach_assessment.get("headroom", 0)
            await self.sse_manager.agent_finding(
                state.run_id, WorkflowStep.LIQUIDITY, self.agent_name,
                finding_type="liquidity_ok",
                finding=f"Sufficient headroom: ${headroom:,.2f} above buffer",
                severity="info",
                details={"headroom": headroom},
            )

        # Emit tool call event
        await self.sse_manager.tool_call(
            state.run_id,
            WorkflowStep.LIQUIDITY,
            self.agent_name,
            "compute_liquidity_impact",
            tool_run_id=liquidity_result.tool_run_id,
            output_summary=f"{'BREACH' if breach else 'NO_BREACH'}",
        )

        # Build result summary
        reason = liquidity_result.recommendation.get("reason", "")
        if breach:
            gap = breach_assessment.get("gap", 0)
            result_summary = f"BREACH - Gap: ${gap:,.2f} | {reason[:80]}"
        else:
            result_summary = f"OK | {reason[:80]}"

        # Complete step
        await self.sse_manager.step_completed(
            state.run_id,
            WorkflowStep.LIQUIDITY,
            agent=self.agent_name,
            result_summary=result_summary,
            result_data={
                "breach": breach,
                "gap": breach_assessment.get("gap", 0) if breach else 0,
                "buffer_threshold": buffer_threshold,
                "projected_balance": projected_min,
                "recommendation": liquidity_result.recommendation.get("action", "UNKNOWN"),
            },
        )
        run_logger.step_completed("liquidity", f"Breach: {breach}")

        state.timestamps["liquidity_completed"] = datetime.now(timezone.utc).isoformat()

        logger.info(
            "liquidity_executor_completed",
            run_id=state.run_id,
            breach=breach,
        )

        await ctx.send_message(state)


# =============================================================================
# Procedures Executor
# =============================================================================

class ProceduresExecutor(Executor):
    """
    Executes operational procedures agent via Foundry.
    Determines workflow steps, approvals, and citations.
    """

    def __init__(
        self,
        foundry_client: Optional[FoundryAgentClient] = None,
        sse_manager: Optional[SSEManager] = None,
        agent_name: str = "operational-procedures-agent",
    ):
        super().__init__(id="procedures_executor")
        self.foundry_client = foundry_client or get_foundry_client()
        self.sse_manager = sse_manager or get_sse_manager()
        self.agent_name = agent_name

    @handler
    async def determine_procedures(
        self,
        state: EmergencyPaymentState,
        ctx: WorkflowContext[EmergencyPaymentState, Never],
    ) -> None:
        """Run operational procedures agent."""
        run_logger = RunbookLogger(state.run_id)

        # Skip if workflow should terminate early
        if state.should_terminate_early:
            logger.info(
                "procedures_executor_skipped",
                run_id=state.run_id,
                reason=state.termination_reason,
            )
            await ctx.send_message(state)
            return

        logger.info(
            "procedures_executor_started",
            run_id=state.run_id,
        )

        # Emit SSE event
        await self.sse_manager.step_started(
            state.run_id,
            WorkflowStep.PROCEDURES,
            agent=self.agent_name,
        )
        run_logger.step_started("procedures", self.agent_name)

        # Build payment context
        payment_context = {
            "payment_id": state.payment.payment_id,
            "amount": state.payment.amount,
            "currency": state.payment.currency,
            "beneficiary_name": state.payment.beneficiary_name,
            "entity": state.payment.entity,
            "account_id": state.payment.account_id,
            "channel": state.payment.channel,
            "timestamp_utc": state.payment.timestamp_utc,
        }

        # Call Foundry agent (sanctions and liquidity results are guaranteed non-None at this point)
        assert state.sanctions_result is not None, "Sanctions result required"
        assert state.liquidity_result is not None, "Liquidity result required"

        breach = state.liquidity_result.breach_assessment.get("breach", False) if state.liquidity_result else False

        # Emit thinking trace BEFORE the agent call so the UI
        # shows the "thinking" animation while the agent works
        await self.sse_manager.agent_thinking(
            state.run_id,
            WorkflowStep.PROCEDURES,
            self.agent_name,
            "Consulting treasury knowledge base for applicable policies and procedures",
            context={
                "sanctions_decision": state.sanctions_result.decision.value,
                "liquidity_breach": breach,
                "amount": state.payment.amount,
            },
        )

        procedures_result = await self.foundry_client.run_operational_procedures(
            payment_context=payment_context,
            sanctions_result=state.sanctions_result,
            liquidity_result=state.liquidity_result,
            run_logger=run_logger,
        )

        state.procedures_result = procedures_result

        final_action = procedures_result.workflow_determination.get("final_action", "HOLD")
        reason = procedures_result.workflow_determination.get("reason", "")
        policy_ref = procedures_result.workflow_determination.get("policy_reference", "")

        # Log KB query if citations present
        if procedures_result.citations:
            await self.sse_manager.kb_query(
                state.run_id,
                WorkflowStep.PROCEDURES,
                self.agent_name,
                "treasury policies and procedures",
                len(procedures_result.citations),
                [c.source for c in procedures_result.citations],
            )

        # Emit detail traces for determination
        await self.sse_manager.agent_detail(
            state.run_id, WorkflowStep.PROCEDURES, self.agent_name,
            "Determined Action", final_action, category="info",
        )
        if policy_ref:
            await self.sse_manager.agent_detail(
                state.run_id, WorkflowStep.PROCEDURES, self.agent_name,
                "Policy Reference", policy_ref, category="info",
            )

        # Emit finding for required approvals
        if procedures_result.required_approvals:
            approvers = [a.role for a in procedures_result.required_approvals]
            await self.sse_manager.agent_finding(
                state.run_id, WorkflowStep.PROCEDURES, self.agent_name,
                finding_type="approvals_required",
                finding=f"Required approvals: {', '.join(approvers)}",
                severity="warning" if len(approvers) > 1 else "info",
                details={
                    "approvers": [
                        {"role": a.role, "authority": a.authority, "sla_hours": a.sla_hours}
                        for a in procedures_result.required_approvals
                    ]
                },
            )

        # Emit finding for procedure steps
        if procedures_result.workflow_steps:
            await self.sse_manager.agent_finding(
                state.run_id, WorkflowStep.PROCEDURES, self.agent_name,
                finding_type="procedure_steps",
                finding=f"{len(procedures_result.workflow_steps)} operational steps identified",
                severity="info",
                details={
                    "steps": [
                        {"step": s.step_number, "action": s.action, "responsible": s.responsible}
                        for s in procedures_result.workflow_steps
                    ]
                },
            )

        # Build result summary
        approvals_count = len(procedures_result.required_approvals)
        result_summary = f"{final_action} | {reason[:80]} | {approvals_count} approvals needed"

        # Complete step
        await self.sse_manager.step_completed(
            state.run_id,
            WorkflowStep.PROCEDURES,
            agent=self.agent_name,
            result_summary=result_summary,
            result_data={
                "final_action": final_action,
                "reason": reason,
                "policy_reference": policy_ref,
                "approvals_count": approvals_count,
                "steps_count": len(procedures_result.workflow_steps),
                "citations_count": len(procedures_result.citations),
            },
        )
        run_logger.step_completed("procedures", f"Action: {final_action}")

        state.timestamps["procedures_completed"] = datetime.now(timezone.utc).isoformat()

        logger.info(
            "procedures_executor_completed",
            run_id=state.run_id,
            final_action=final_action,
        )

        await ctx.send_message(state)


# =============================================================================
# Summarize Executor
# =============================================================================

class SummarizeExecutor(Executor):
    """
    Final executor that creates the DecisionPacket.
    Handles both normal completion and early termination cases.
    """

    def __init__(
        self,
        sse_manager: Optional[SSEManager] = None,
    ):
        super().__init__(id="summarize_executor")
        self.sse_manager = sse_manager or get_sse_manager()

    @handler
    async def create_decision_packet(
        self,
        state: EmergencyPaymentState,
        ctx: WorkflowContext[EmergencyPaymentState, DecisionPacket],
    ) -> None:
        """Create final decision packet."""
        run_logger = RunbookLogger(state.run_id)

        logger.info(
            "summarize_executor_started",
            run_id=state.run_id,
            terminate_early=state.should_terminate_early,
        )

        # Emit SSE event
        await self.sse_manager.step_started(state.run_id, WorkflowStep.SUMMARIZE)
        run_logger.step_started("summarize")

        state.timestamps["workflow_completed"] = datetime.now(timezone.utc).isoformat()

        # Create decision packet based on workflow outcome
        if state.should_terminate_early and state.termination_reason == "SANCTIONS_BLOCK":
            decision_packet = self._create_block_decision(state)
        else:
            decision_packet = self._create_normal_decision(state)

        state.decision_packet = decision_packet

        # Emit final event
        await self.sse_manager.final(
            run_id=state.run_id,
            decision=decision_packet.decision.value,
            summary=decision_packet.rationale[0] if decision_packet.rationale else "",
            decision_packet=decision_packet.model_dump(),
        )

        run_logger.step_completed("summarize", f"Final decision: {decision_packet.decision.value}")

        logger.info(
            "summarize_executor_completed",
            run_id=state.run_id,
            decision=decision_packet.decision.value,
        )

        # Yield final output
        await ctx.yield_output(decision_packet)

    def _create_block_decision(self, state: EmergencyPaymentState) -> DecisionPacket:
        """Create decision packet for sanctions BLOCK."""
        sanctions = state.sanctions_result
        assert sanctions is not None, "Sanctions result required for BLOCK decision"

        return DecisionPacket(
            run_id=state.run_id,
            payment=state.payment,
            decision=FinalDecision.REJECT,
            rationale=[
                f"Payment BLOCKED due to sanctions match: {sanctions.match_type}",
                f"Beneficiary '{state.payment.beneficiary_name}' matched against SDN list",
                f"Confidence: {sanctions.confidence}%",
                "Immediate rejection required per compliance policy",
            ],
            procedure_checklist=[
                WorkflowStepChecklist(
                    step_number=1,
                    action="REJECT payment immediately",
                    responsible="System (automatic)",
                    documentation_required="Sanctions match details, rejection timestamp",
                ),
                WorkflowStepChecklist(
                    step_number=2,
                    action="Generate compliance case",
                    responsible="Compliance Officer",
                    documentation_required="Full sanctions report, evidence package",
                ),
                WorkflowStepChecklist(
                    step_number=3,
                    action="File regulatory report if required",
                    responsible="MLRO",
                    documentation_required="SAR/STR as applicable",
                ),
            ],
            approvals_required=[
                ApprovalRequired(
                    role="Compliance Officer",
                    authority="Review and document sanctions match",
                    sla_hours=4,
                ),
            ],
            sod_constraints=["No self-approval of compliance review"],
            cutoff_actions=["Immediate rejection - no cutoff applicable"],
            citations=[
                Citation(
                    source="OFAC SDN List",
                    snippet=f"Match found: {sanctions.match_details}",
                    reference="idx-ofac-sdn-v1",
                ),
            ],
            audit_note={
                "workflow_terminated_early": True,
                "termination_reason": "SANCTIONS_BLOCK",
                "sanctions_tool_run_id": sanctions.tool_run_id,
            },
            timestamps=state.timestamps,
            sanctions_result=sanctions,
        )

    def _create_normal_decision(self, state: EmergencyPaymentState) -> DecisionPacket:
        """Create decision packet from full workflow results."""
        sanctions = state.sanctions_result
        liquidity = state.liquidity_result
        procedures = state.procedures_result

        # Map final action to decision
        final_action = procedures.workflow_determination.get("final_action", "HOLD") if procedures else "HOLD"
        decision_map = {
            "RELEASE": FinalDecision.RELEASE,
            "PROCEED": FinalDecision.RELEASE,
            "HOLD": FinalDecision.HOLD,
            "PARTIAL": FinalDecision.PARTIAL,
            "ESCALATE": FinalDecision.ESCALATE,
            "REJECT": FinalDecision.REJECT,
        }
        decision = decision_map.get(final_action.upper(), FinalDecision.HOLD)

        # Build rationale
        breach = liquidity.breach_assessment.get("breach", False) if liquidity else False
        rationale = [
            f"Sanctions screening: {sanctions.decision.value} ({sanctions.confidence}% confidence)" if sanctions else "Sanctions: N/A",
            f"Liquidity assessment: {'BREACH detected' if breach else 'No breach'}",
            f"Final action: {final_action}",
            procedures.workflow_determination.get("reason", "") if procedures else "",
        ]

        # Extract SoD constraints
        sod_constraints = [
            "Maker-checker separation required for approvals",
            "No self-approval permitted",
        ]
        if state.payment.amount > 250000:
            sod_constraints.append("Dual approval required for amounts > USD 250,000")

        # Extract cutoff actions
        cutoff_actions = []
        if breach:
            cutoff_actions.append("Payment held pending liquidity resolution")
        if decision == FinalDecision.HOLD:
            cutoff_actions.append("Cutoff extension may be requested with Treasury Manager approval")

        return DecisionPacket(
            run_id=state.run_id,
            payment=state.payment,
            decision=decision,
            rationale=rationale,
            procedure_checklist=procedures.workflow_steps if procedures else [],
            approvals_required=procedures.required_approvals if procedures else [],
            sod_constraints=sod_constraints,
            cutoff_actions=cutoff_actions,
            citations=procedures.citations if procedures else [],
            audit_note={
                "sanctions_tool_run_id": sanctions.tool_run_id if sanctions else None,
                "liquidity_tool_run_id": liquidity.tool_run_id if liquidity else None,
                "procedures_tool_run_id": procedures.tool_run_id if procedures else None,
                "policies_consulted": procedures.audit.get("policies_consulted", []) if procedures else [],
            },
            timestamps=state.timestamps,
            sanctions_result=sanctions,
            liquidity_result=liquidity,
            procedures_result=procedures,
        )
