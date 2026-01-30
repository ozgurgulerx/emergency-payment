"""
Workflow orchestrator for the Emergency Payment Runbook.
Coordinates the sequential agent workflow: Sanctions -> Liquidity -> Procedures.

Uses Microsoft Agent Framework for workflow orchestration with custom executors
that wrap Azure AI Foundry hosted agents.
"""

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from .config import get_settings
from .foundry_client import get_foundry_client, FoundryAgentClient
from .logging_config import get_logger, RunbookLogger
from .schemas import (
    ApprovalRequired,
    Citation,
    DecisionPacket,
    FinalDecision,
    LiquidityResult,
    PaymentRequest,
    ProceduresResult,
    RunbookStartRequest,
    RunStatus,
    SanctionsDecision,
    SanctionsResult,
    WorkflowStep,
    WorkflowStepChecklist,
)
from .sse import get_sse_manager, SSEManager
from .storage import get_storage, RunbookStorage

# Optional agent-framework imports (only available if agent_framework is installed)
try:
    from .executors import EmergencyPaymentState
    from .workflows import create_emergency_payment_workflow
    AGENT_FRAMEWORK_AVAILABLE = True
except ImportError:
    AGENT_FRAMEWORK_AVAILABLE = False
    EmergencyPaymentState = None
    create_emergency_payment_workflow = None

logger = get_logger("orchestrator")


class PaymentIntakeParser:
    """Parser for extracting payment details from user messages."""

    # Patterns for extracting payment information
    # Match amounts like: $250,000, 100000, 50,000.00, etc.
    AMOUNT_PATTERN = re.compile(
        r'(?:\$\s*)?(\d{1,3}(?:,\d{3})+|\d{4,})(?:\.\d{2})?\s*(?:USD|EUR|TRY|GBP|dollars?)?',
        re.IGNORECASE
    )
    CURRENCY_PATTERN = re.compile(r'\b(USD|EUR|TRY|GBP|dollars?|euros?|lira|pounds?)\b', re.IGNORECASE)
    # Match beneficiary after "to" keyword
    BENEFICIARY_PATTERN = re.compile(
        r'\bto\s+([A-Z][A-Za-z0-9\s&.,\'-]+(?:LLC|Inc|Corp|Ltd|Co|Trading|Bank|Company)?)\s*$',
        re.IGNORECASE
    )

    @classmethod
    def parse(
        cls,
        message: str,
        overrides: Optional[dict[str, Any]] = None,
    ) -> PaymentRequest:
        """Parse user message into PaymentRequest.

        Args:
            message: User's natural language message
            overrides: Optional field overrides

        Returns:
            Normalized PaymentRequest
        """
        overrides = overrides or {}

        # Extract amount
        amount = cls._extract_amount(message)
        if "amount" in overrides:
            amount = float(overrides["amount"])

        # Extract currency
        currency = cls._extract_currency(message)
        if "currency" in overrides:
            currency = overrides["currency"]

        # Extract beneficiary
        beneficiary = cls._extract_beneficiary(message)
        if "beneficiary_name" in overrides:
            beneficiary = overrides["beneficiary_name"]

        # Build PaymentRequest with defaults and overrides
        return PaymentRequest(
            payment_id=overrides.get("payment_id", f"TXN-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"),
            beneficiary_name=beneficiary,
            amount=amount,
            currency=currency,
            timestamp_utc=overrides.get("timestamp_utc", datetime.now(timezone.utc).isoformat()),
            entity=overrides.get("entity", "BankSubsidiary_TR"),
            account_id=overrides.get("account_id", "ACC-BAN-001"),
            channel=overrides.get("channel", "SWIFT"),
            freeform_notes=message,
        )

    @classmethod
    def _extract_amount(cls, message: str) -> float:
        """Extract payment amount from message."""
        matches = cls.AMOUNT_PATTERN.findall(message)
        if matches:
            # Take the largest number found (likely the payment amount)
            amounts = [float(m.replace(',', '')) for m in matches]
            return max(amounts)
        return 0.0

    @classmethod
    def _extract_currency(cls, message: str) -> str:
        """Extract currency from message."""
        match = cls.CURRENCY_PATTERN.search(message)
        if match:
            curr = match.group(1).upper()
            # Normalize currency names
            if curr in ('DOLLAR', 'DOLLARS'):
                return 'USD'
            if curr in ('EURO', 'EUROS'):
                return 'EUR'
            if curr in ('LIRA',):
                return 'TRY'
            if curr in ('POUND', 'POUNDS'):
                return 'GBP'
            return curr
        return 'USD'  # Default

    @classmethod
    def _extract_beneficiary(cls, message: str) -> str:
        """Extract beneficiary name from message."""
        match = cls.BENEFICIARY_PATTERN.search(message)
        if match:
            return match.group(1).strip()

        # Alternative pattern: look for "to [Name]" anywhere in message
        alt_pattern = re.compile(r'\bto\s+([A-Z][A-Za-z0-9\s&.,\'-]+?)(?:\s+(?:for|from|amount|of|\$|USD|EUR|TRY|GBP|\d)|\.|,|$)', re.IGNORECASE)
        match = alt_pattern.search(message)
        if match:
            name = match.group(1).strip()
            # Remove trailing noise words
            name = re.sub(r'\s+(for|from|amount|of)$', '', name, flags=re.IGNORECASE)
            if name and len(name) > 2:
                return name

        # Fallback: look for company-like names (words with LLC, Inc, Corp, etc.)
        company_pattern = re.compile(r'\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3}\s+(?:LLC|Inc|Corp|Ltd|Co|Trading|Bank|Company))\b')
        match = company_pattern.search(message)
        if match:
            return match.group(1)

        return "Unknown Beneficiary"


class WorkflowOrchestrator:
    """Orchestrates the emergency payment workflow."""

    def __init__(
        self,
        foundry_client: Optional[FoundryAgentClient] = None,
        sse_manager: Optional[SSEManager] = None,
        storage: Optional[RunbookStorage] = None,
    ):
        """Initialize the orchestrator.

        Args:
            foundry_client: Foundry client for agent calls
            sse_manager: SSE manager for streaming events
            storage: Storage for persistence
        """
        self.foundry_client = foundry_client or get_foundry_client()
        self.sse_manager = sse_manager or get_sse_manager()
        self.storage = storage or get_storage()
        self.settings = get_settings()

    async def start_workflow(self, request: RunbookStartRequest) -> str:
        """Start a new workflow run.

        Args:
            request: The runbook start request

        Returns:
            run_id for the new workflow
        """
        run_id = str(uuid.uuid4())

        # Parse payment from message
        # Filter out None values from overrides
        overrides = {}
        if request.overrides:
            overrides = {k: v for k, v in request.overrides.model_dump().items() if v is not None}
        payment = PaymentIntakeParser.parse(request.message, overrides)

        # Create storage record
        self.storage.create_run(
            run_id=run_id,
            request_payload={
                "message": request.message,
                "overrides": overrides,
                "payment": payment.model_dump(),
            },
        )

        # Initialize SSE tracking
        await self.sse_manager.start_run(run_id)

        logger.info(f"Started workflow run: {run_id} for payment to {payment.beneficiary_name}")
        return run_id

    async def execute_workflow(self, run_id: str) -> DecisionPacket:
        """Execute the full workflow for a run.

        Args:
            run_id: Run identifier

        Returns:
            Final DecisionPacket
        """
        run_logger = RunbookLogger(run_id)
        timestamps: dict[str, str] = {}

        try:
            # Update status to running
            self.storage.update_run_status(run_id, RunStatus.RUNNING)

            # Get run data
            run_data = self.storage.get_run(run_id)
            if not run_data:
                raise ValueError(f"Run not found: {run_id}")

            payment = PaymentRequest(**run_data.request_payload.get("payment", {}))
            timestamps["workflow_started"] = datetime.now(timezone.utc).isoformat()

            # =================================================================
            # Step 1: Intake
            # =================================================================
            await self.sse_manager.step_started(run_id, WorkflowStep.INTAKE)
            run_logger.step_started("intake")

            payment_context = {
                "payment_id": payment.payment_id,
                "amount": payment.amount,
                "currency": payment.currency,
                "beneficiary_name": payment.beneficiary_name,
                "entity": payment.entity,
                "account_id": payment.account_id,
                "channel": payment.channel,
                "timestamp_utc": payment.timestamp_utc,
            }

            await self.sse_manager.step_completed(
                run_id,
                WorkflowStep.INTAKE,
                result_summary=f"Payment ${payment.amount:,.2f} {payment.currency} to {payment.beneficiary_name}",
                result_data=payment_context,
            )
            run_logger.step_completed("intake", f"Parsed payment: {payment.payment_id}")
            timestamps["intake_completed"] = datetime.now(timezone.utc).isoformat()

            # =================================================================
            # Step 2: Sanctions Screening
            # =================================================================
            await self.sse_manager.step_started(
                run_id,
                WorkflowStep.SANCTIONS,
                agent=self.settings.azure_foundry_agent_sanctions,
            )
            run_logger.step_started("sanctions", self.settings.azure_foundry_agent_sanctions)

            sanctions_result = await self.foundry_client.run_sanctions_screening(
                beneficiary_name=payment.beneficiary_name,
                payment_context=payment_context,
                run_logger=run_logger,
            )

            # Emit detailed sanctions analysis traces
            await self.sse_manager.agent_thinking(
                run_id,
                WorkflowStep.SANCTIONS,
                self.settings.azure_foundry_agent_sanctions,
                f"Screening beneficiary '{payment.beneficiary_name}' against sanctions lists",
                context={"lists_checked": ["OFAC SDN", "EU Sanctions", "UN Sanctions"]},
            )

            # Emit screening details
            await self.sse_manager.agent_detail(
                run_id,
                WorkflowStep.SANCTIONS,
                self.settings.azure_foundry_agent_sanctions,
                "Beneficiary Name",
                payment.beneficiary_name,
                category="info",
            )
            await self.sse_manager.agent_detail(
                run_id,
                WorkflowStep.SANCTIONS,
                self.settings.azure_foundry_agent_sanctions,
                "Match Type",
                sanctions_result.match_type,
                category="info",
            )
            await self.sse_manager.agent_detail(
                run_id,
                WorkflowStep.SANCTIONS,
                self.settings.azure_foundry_agent_sanctions,
                "Confidence Score",
                f"{sanctions_result.confidence}%",
                category="metric",
            )

            # Emit finding based on decision
            if sanctions_result.decision == SanctionsDecision.BLOCK:
                match_details = sanctions_result.match_details or {}
                await self.sse_manager.agent_finding(
                    run_id,
                    WorkflowStep.SANCTIONS,
                    self.settings.azure_foundry_agent_sanctions,
                    finding_type="sanctions_match",
                    finding=f"BLOCKED: {sanctions_result.match_type} match found against SDN list",
                    severity="critical",
                    details={
                        "matched_entity": match_details.get("matched_entity", payment.beneficiary_name),
                        "programs": match_details.get("programs", []),
                        "confidence": sanctions_result.confidence,
                    },
                )
            elif sanctions_result.decision == SanctionsDecision.ESCALATE:
                await self.sse_manager.agent_finding(
                    run_id,
                    WorkflowStep.SANCTIONS,
                    self.settings.azure_foundry_agent_sanctions,
                    finding_type="potential_match",
                    finding=f"Potential match requires manual review (confidence: {sanctions_result.confidence}%)",
                    severity="warning",
                    details={"recommendation": sanctions_result.recommendation},
                )
            else:
                await self.sse_manager.agent_finding(
                    run_id,
                    WorkflowStep.SANCTIONS,
                    self.settings.azure_foundry_agent_sanctions,
                    finding_type="sanctions_clear",
                    finding="No sanctions matches found - beneficiary cleared",
                    severity="info",
                    details={"confidence": sanctions_result.confidence},
                )

            await self.sse_manager.tool_call(
                run_id,
                WorkflowStep.SANCTIONS,
                self.settings.azure_foundry_agent_sanctions,
                "screen_sanctions",
                tool_run_id=sanctions_result.tool_run_id,
                output_summary=f"{sanctions_result.decision.value} ({sanctions_result.confidence}%)",
            )

            # Build comprehensive result summary
            result_summary = f"{sanctions_result.decision.value} ({sanctions_result.confidence}%)"
            if sanctions_result.match_type != "NONE":
                result_summary += f" | Match: {sanctions_result.match_type}"
            result_summary += f" | {sanctions_result.recommendation[:60]}"

            await self.sse_manager.step_completed(
                run_id,
                WorkflowStep.SANCTIONS,
                agent=self.settings.azure_foundry_agent_sanctions,
                result_summary=result_summary,
                result_data={
                    "decision": sanctions_result.decision.value,
                    "confidence": sanctions_result.confidence,
                    "match_type": sanctions_result.match_type,
                    "recommendation": sanctions_result.recommendation,
                },
            )
            run_logger.step_completed("sanctions", f"Decision: {sanctions_result.decision.value}")
            timestamps["sanctions_completed"] = datetime.now(timezone.utc).isoformat()

            # Check for BLOCK decision - stop workflow
            if sanctions_result.decision == SanctionsDecision.BLOCK:
                await self.sse_manager.branch(
                    run_id,
                    WorkflowStep.SANCTIONS,
                    "sanctions_decision == BLOCK",
                    "TERMINATE",
                    "Sanctions BLOCK requires immediate rejection",
                )
                run_logger.branch_taken("sanctions_decision == BLOCK", "TERMINATE")

                # Create decision packet for BLOCK
                decision_packet = self._create_block_decision(
                    run_id, payment, sanctions_result, timestamps
                )

                await self._finalize_workflow(run_id, decision_packet, run_logger)
                return decision_packet

            # =================================================================
            # Step 3: Liquidity Screening
            # =================================================================
            await self.sse_manager.step_started(
                run_id,
                WorkflowStep.LIQUIDITY,
                agent=self.settings.azure_foundry_agent_liquidity,
            )
            run_logger.step_started("liquidity", self.settings.azure_foundry_agent_liquidity)

            liquidity_result = await self.foundry_client.run_liquidity_screening(
                payment_context=payment_context,
                run_logger=run_logger,
            )

            breach = liquidity_result.breach_assessment.get("breach", False)
            breach_assessment = liquidity_result.breach_assessment
            account_summary = liquidity_result.account_summary

            # Emit detailed liquidity analysis traces
            await self.sse_manager.agent_thinking(
                run_id,
                WorkflowStep.LIQUIDITY,
                self.settings.azure_foundry_agent_liquidity,
                f"Analyzing liquidity impact for {payment.currency} {payment.amount:,.2f} payment",
                context={"entity": payment.entity, "account": payment.account_id},
            )

            # Emit account balance details
            if account_summary:
                await self.sse_manager.agent_detail(
                    run_id,
                    WorkflowStep.LIQUIDITY,
                    self.settings.azure_foundry_agent_liquidity,
                    "Start of Day Balance",
                    f"${account_summary.get('start_of_day_balance', 0):,.2f}",
                    category="metric",
                )
                await self.sse_manager.agent_detail(
                    run_id,
                    WorkflowStep.LIQUIDITY,
                    self.settings.azure_foundry_agent_liquidity,
                    "Total Outflows Today",
                    f"${account_summary.get('total_outflow', 0):,.2f}",
                    category="metric",
                )
                await self.sse_manager.agent_detail(
                    run_id,
                    WorkflowStep.LIQUIDITY,
                    self.settings.azure_foundry_agent_liquidity,
                    "Projected End of Day",
                    f"${account_summary.get('end_of_day_balance', 0):,.2f}",
                    category="metric",
                )

            # Emit buffer threshold comparison
            if breach_assessment:
                buffer_threshold = breach_assessment.get("buffer_threshold", 0)
                projected_min = breach_assessment.get("projected_min_balance", 0)
                headroom = breach_assessment.get("headroom", 0)

                await self.sse_manager.agent_detail(
                    run_id,
                    WorkflowStep.LIQUIDITY,
                    self.settings.azure_foundry_agent_liquidity,
                    "Buffer Threshold",
                    f"${buffer_threshold:,.2f}",
                    category="threshold",
                )
                await self.sse_manager.agent_detail(
                    run_id,
                    WorkflowStep.LIQUIDITY,
                    self.settings.azure_foundry_agent_liquidity,
                    "Projected Minimum Balance",
                    f"${projected_min:,.2f}",
                    category="comparison",
                )

                # Emit finding based on breach status
                if breach:
                    gap = breach_assessment.get("gap", 0)
                    first_breach_time = breach_assessment.get("first_breach_time", "unknown")
                    await self.sse_manager.agent_finding(
                        run_id,
                        WorkflowStep.LIQUIDITY,
                        self.settings.azure_foundry_agent_liquidity,
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
                    await self.sse_manager.agent_finding(
                        run_id,
                        WorkflowStep.LIQUIDITY,
                        self.settings.azure_foundry_agent_liquidity,
                        finding_type="liquidity_ok",
                        finding=f"Sufficient headroom: ${headroom:,.2f} above buffer",
                        severity="info",
                        details={"headroom": headroom},
                    )

            await self.sse_manager.tool_call(
                run_id,
                WorkflowStep.LIQUIDITY,
                self.settings.azure_foundry_agent_liquidity,
                "compute_liquidity_impact",
                tool_run_id=liquidity_result.tool_run_id,
                output_summary=f"{'BREACH' if breach else 'NO_BREACH'}",
            )

            # Build comprehensive result summary
            result_summary = f"{'BREACH' if breach else 'OK'}"
            if breach and breach_assessment.get("gap"):
                result_summary += f" - Gap: ${breach_assessment.get('gap', 0):,.2f}"
            result_summary += f" | {liquidity_result.recommendation.get('reason', '')[:80]}"

            await self.sse_manager.step_completed(
                run_id,
                WorkflowStep.LIQUIDITY,
                agent=self.settings.azure_foundry_agent_liquidity,
                result_summary=result_summary,
                result_data={
                    "breach": breach,
                    "gap": breach_assessment.get("gap", 0) if breach else 0,
                    "buffer_threshold": breach_assessment.get("buffer_threshold", 0),
                    "projected_balance": breach_assessment.get("projected_min_balance", 0),
                    "recommendation": liquidity_result.recommendation.get("action", "UNKNOWN"),
                },
            )
            run_logger.step_completed("liquidity", f"Breach: {breach}")
            timestamps["liquidity_completed"] = datetime.now(timezone.utc).isoformat()

            # =================================================================
            # Step 4: Operational Procedures
            # =================================================================
            await self.sse_manager.step_started(
                run_id,
                WorkflowStep.PROCEDURES,
                agent=self.settings.azure_foundry_agent_procedures,
            )
            run_logger.step_started("procedures", self.settings.azure_foundry_agent_procedures)

            procedures_result = await self.foundry_client.run_operational_procedures(
                payment_context=payment_context,
                sanctions_result=sanctions_result,
                liquidity_result=liquidity_result,
                run_logger=run_logger,
            )

            # Emit detailed procedures analysis traces
            await self.sse_manager.agent_thinking(
                run_id,
                WorkflowStep.PROCEDURES,
                self.settings.azure_foundry_agent_procedures,
                "Consulting treasury knowledge base for applicable policies and procedures",
                context={
                    "sanctions_decision": sanctions_result.decision.value,
                    "liquidity_breach": breach,
                    "amount": payment.amount,
                },
            )

            # Log KB query if citations present
            if procedures_result.citations:
                await self.sse_manager.kb_query(
                    run_id,
                    WorkflowStep.PROCEDURES,
                    self.settings.azure_foundry_agent_procedures,
                    "treasury policies and procedures",
                    len(procedures_result.citations),
                    [c.source for c in procedures_result.citations],
                )
                # Emit details for each citation
                for citation in procedures_result.citations[:3]:  # Limit to first 3
                    await self.sse_manager.agent_detail(
                        run_id,
                        WorkflowStep.PROCEDURES,
                        self.settings.azure_foundry_agent_procedures,
                        f"Policy: {citation.source}",
                        citation.snippet[:100] + "..." if len(citation.snippet) > 100 else citation.snippet,
                        category="info",
                    )

            final_action = procedures_result.workflow_determination.get("final_action", "HOLD")
            reason = procedures_result.workflow_determination.get("reason", "")
            policy_ref = procedures_result.workflow_determination.get("policy_reference", "")

            # Emit workflow determination details
            await self.sse_manager.agent_detail(
                run_id,
                WorkflowStep.PROCEDURES,
                self.settings.azure_foundry_agent_procedures,
                "Determined Action",
                final_action,
                category="info",
            )
            if policy_ref:
                await self.sse_manager.agent_detail(
                    run_id,
                    WorkflowStep.PROCEDURES,
                    self.settings.azure_foundry_agent_procedures,
                    "Policy Reference",
                    policy_ref,
                    category="info",
                )

            # Emit required approvals
            if procedures_result.required_approvals:
                approvers = [a.role for a in procedures_result.required_approvals]
                await self.sse_manager.agent_finding(
                    run_id,
                    WorkflowStep.PROCEDURES,
                    self.settings.azure_foundry_agent_procedures,
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

            # Emit workflow steps summary
            if procedures_result.workflow_steps:
                await self.sse_manager.agent_finding(
                    run_id,
                    WorkflowStep.PROCEDURES,
                    self.settings.azure_foundry_agent_procedures,
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

            # Build comprehensive result summary
            result_summary = f"{final_action}"
            if reason:
                result_summary += f" | {reason[:80]}"
            if procedures_result.required_approvals:
                result_summary += f" | {len(procedures_result.required_approvals)} approvals needed"

            await self.sse_manager.step_completed(
                run_id,
                WorkflowStep.PROCEDURES,
                agent=self.settings.azure_foundry_agent_procedures,
                result_summary=result_summary,
                result_data={
                    "final_action": final_action,
                    "reason": reason,
                    "policy_reference": policy_ref,
                    "approvals_count": len(procedures_result.required_approvals),
                    "steps_count": len(procedures_result.workflow_steps),
                    "citations_count": len(procedures_result.citations),
                },
            )
            run_logger.step_completed("procedures", f"Action: {final_action}")
            timestamps["procedures_completed"] = datetime.now(timezone.utc).isoformat()

            # =================================================================
            # Step 5: Summarize and Finalize
            # =================================================================
            await self.sse_manager.step_started(run_id, WorkflowStep.SUMMARIZE)
            run_logger.step_started("summarize")

            decision_packet = self._create_decision_packet(
                run_id=run_id,
                payment=payment,
                sanctions_result=sanctions_result,
                liquidity_result=liquidity_result,
                procedures_result=procedures_result,
                timestamps=timestamps,
            )

            await self._finalize_workflow(run_id, decision_packet, run_logger)
            return decision_packet

        except Exception as e:
            run_logger.error(f"Workflow failed: {e}")

            await self.sse_manager.error(
                run_id,
                WorkflowStep.SUMMARIZE,
                "orchestrator",
                str(e),
                error_type=type(e).__name__,
                recoverable=False,
            )

            self.storage.update_run_status(run_id, RunStatus.FAILED, error=str(e))
            await self.sse_manager.end_run(run_id)

            raise

    async def _finalize_workflow(
        self,
        run_id: str,
        decision_packet: DecisionPacket,
        run_logger: RunbookLogger,
    ) -> None:
        """Finalize the workflow with decision and cleanup."""
        # Save decision
        self.storage.save_decision(run_id, decision_packet)

        # Emit final event
        await self.sse_manager.final(
            run_id=run_id,
            decision=decision_packet.decision.value,
            summary=decision_packet.rationale[0] if decision_packet.rationale else "",
            decision_packet=decision_packet.model_dump(),
        )

        run_logger.step_completed("summarize", f"Final decision: {decision_packet.decision.value}")

        # End SSE stream
        await self.sse_manager.end_run(run_id)

        logger.info(f"Workflow completed: {run_id} -> {decision_packet.decision.value}")

    def _create_block_decision(
        self,
        run_id: str,
        payment: PaymentRequest,
        sanctions_result: SanctionsResult,
        timestamps: dict[str, str],
    ) -> DecisionPacket:
        """Create decision packet for sanctions BLOCK."""
        timestamps["workflow_completed"] = datetime.now(timezone.utc).isoformat()

        return DecisionPacket(
            run_id=run_id,
            payment=payment,
            decision=FinalDecision.REJECT,
            rationale=[
                f"Payment BLOCKED due to sanctions match: {sanctions_result.match_type}",
                f"Beneficiary '{payment.beneficiary_name}' matched against SDN list",
                f"Confidence: {sanctions_result.confidence}%",
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
                    snippet=f"Match found: {sanctions_result.match_details}",
                    reference="idx-ofac-sdn-v1",
                ),
            ],
            audit_note={
                "workflow_terminated_early": True,
                "termination_reason": "SANCTIONS_BLOCK",
                "sanctions_tool_run_id": sanctions_result.tool_run_id,
            },
            timestamps=timestamps,
            sanctions_result=sanctions_result,
        )

    def _create_decision_packet(
        self,
        run_id: str,
        payment: PaymentRequest,
        sanctions_result: SanctionsResult,
        liquidity_result: LiquidityResult,
        procedures_result: ProceduresResult,
        timestamps: dict[str, str],
    ) -> DecisionPacket:
        """Create final decision packet from workflow results."""
        timestamps["workflow_completed"] = datetime.now(timezone.utc).isoformat()

        # Map final action to decision
        final_action = procedures_result.workflow_determination.get("final_action", "HOLD")
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
        breach = liquidity_result.breach_assessment.get("breach", False)
        rationale = [
            f"Sanctions screening: {sanctions_result.decision.value} ({sanctions_result.confidence}% confidence)",
            f"Liquidity assessment: {'BREACH detected' if breach else 'No breach'}",
            f"Final action: {final_action}",
            procedures_result.workflow_determination.get("reason", ""),
        ]

        # Extract SoD constraints
        sod_constraints = [
            "Maker-checker separation required for approvals",
            "No self-approval permitted",
        ]
        if payment.amount > 250000:
            sod_constraints.append("Dual approval required for amounts > USD 250,000")

        # Extract cutoff actions
        cutoff_actions = []
        if breach:
            cutoff_actions.append("Payment held pending liquidity resolution")
        if decision == FinalDecision.HOLD:
            cutoff_actions.append("Cutoff extension may be requested with Treasury Manager approval")

        return DecisionPacket(
            run_id=run_id,
            payment=payment,
            decision=decision,
            rationale=rationale,
            procedure_checklist=procedures_result.workflow_steps,
            approvals_required=procedures_result.required_approvals,
            sod_constraints=sod_constraints,
            cutoff_actions=cutoff_actions,
            citations=procedures_result.citations,
            audit_note={
                "sanctions_tool_run_id": sanctions_result.tool_run_id,
                "liquidity_tool_run_id": liquidity_result.tool_run_id,
                "procedures_tool_run_id": procedures_result.tool_run_id,
                "policies_consulted": procedures_result.audit.get("policies_consulted", []),
            },
            timestamps=timestamps,
            sanctions_result=sanctions_result,
            liquidity_result=liquidity_result,
            procedures_result=procedures_result,
        )


    async def execute_workflow_v2(self, run_id: str) -> DecisionPacket:
        """Execute workflow using Agent Framework orchestration.

        This is the new implementation using agent-framework's WorkflowBuilder
        with custom executors that wrap Foundry hosted agents.

        Args:
            run_id: Run identifier

        Returns:
            Final DecisionPacket

        Raises:
            RuntimeError: If agent_framework is not installed
        """
        if not AGENT_FRAMEWORK_AVAILABLE:
            raise RuntimeError(
                "agent_framework is not installed. "
                "Use execute_workflow() instead or install agent-framework-core."
            )

        run_logger = RunbookLogger(run_id)

        try:
            # Update status to running
            self.storage.update_run_status(run_id, RunStatus.RUNNING)

            # Get run data
            run_data = self.storage.get_run(run_id)
            if not run_data:
                raise ValueError(f"Run not found: {run_id}")

            payment = PaymentRequest(**run_data.request_payload.get("payment", {}))

            # Create workflow
            workflow = create_emergency_payment_workflow(
                foundry_client=self.foundry_client,
                sse_manager=self.sse_manager,
            )

            # Create initial state
            initial_state = EmergencyPaymentState(
                run_id=run_id,
                payment=payment,
                timestamps={"workflow_started": datetime.now(timezone.utc).isoformat()},
            )

            logger.info(f"Starting agent-framework workflow for run: {run_id}")

            # Run workflow
            async for event in workflow.run(initial_state):
                # Process workflow events
                logger.debug(f"Workflow event: {type(event).__name__}")

            # Get final output from workflow
            # The SummarizeExecutor yields the DecisionPacket
            decision_packet = initial_state.decision_packet

            if decision_packet is None:
                raise RuntimeError("Workflow completed without producing DecisionPacket")

            # Finalize
            self.storage.save_decision(run_id, decision_packet)
            self.storage.update_run_status(run_id, RunStatus.COMPLETED)
            await self.sse_manager.end_run(run_id)

            logger.info(f"Agent-framework workflow completed: {run_id} -> {decision_packet.decision.value}")
            return decision_packet

        except Exception as e:
            run_logger.error(f"Agent-framework workflow failed: {e}")

            await self.sse_manager.error(
                run_id,
                WorkflowStep.SUMMARIZE,
                "orchestrator",
                str(e),
                error_type=type(e).__name__,
                recoverable=False,
            )

            self.storage.update_run_status(run_id, RunStatus.FAILED, error=str(e))
            await self.sse_manager.end_run(run_id)

            raise


# Singleton orchestrator instance
_orchestrator: Optional[WorkflowOrchestrator] = None


def get_orchestrator() -> WorkflowOrchestrator:
    """Get the orchestrator singleton instance."""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = WorkflowOrchestrator()
    return _orchestrator
