"""
Azure AI Foundry client for interacting with hosted agents.
Wraps the Azure AI Projects SDK with retry logic and error handling.
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from azure.identity.aio import DefaultAzureCredential, get_bearer_token_provider
from azure.ai.projects.aio import AIProjectClient
from openai import AsyncAzureOpenAI

from .config import get_settings, is_dry_run
from .schemas import (
    LiquidityResult,
    ProceduresResult,
    SanctionsDecision,
    SanctionsResult,
    Citation,
    ApprovalRequired,
    WorkflowStepChecklist,
)
from .logging_config import get_logger, RunbookLogger

logger = get_logger("foundry_client")


class FoundryAgentClient:
    """Client for interacting with Azure AI Foundry hosted agents."""

    def __init__(self):
        """Initialize the Foundry client."""
        self.settings = get_settings()
        self._credential: Optional[DefaultAzureCredential] = None
        self._client: Optional[AIProjectClient] = None
        self._openai_client: Optional[AsyncAzureOpenAI] = None
        self._agents_cache: dict[str, dict] = {}  # name -> agent info

    async def _ensure_client(self) -> AIProjectClient:
        """Ensure client is initialized and return it."""
        if self._client is None:
            self._credential = DefaultAzureCredential()
            self._client = AIProjectClient(
                endpoint=self.settings.azure_foundry_project_endpoint,
                credential=self._credential,
            )
            logger.info(f"Initialized Foundry client for project: {self.settings.azure_foundry_project}")
        return self._client

    async def close(self) -> None:
        """Close client connections."""
        if self._openai_client:
            await self._openai_client.close()
            self._openai_client = None
        if self._client:
            await self._client.close()
            self._client = None
        if self._credential:
            await self._credential.close()
            self._credential = None

    def _get_openai_client(self) -> AsyncAzureOpenAI:
        """Get an AsyncAzureOpenAI client for chat completions.

        Uses the Azure OpenAI endpoint (openai.azure.com) for model inference.
        """
        if self._openai_client is None:
            if self._credential is None:
                self._credential = DefaultAzureCredential()

            # Get token provider for Azure AD authentication
            token_provider = get_bearer_token_provider(
                self._credential,
                "https://cognitiveservices.azure.com/.default"
            )

            # Use Azure OpenAI endpoint for chat completions
            self._openai_client = AsyncAzureOpenAI(
                azure_endpoint=self.settings.azure_openai_endpoint,
                azure_ad_token_provider=token_provider,
                api_version="2024-12-01-preview",
            )
        return self._openai_client

    async def _get_agent_info(self, agent_name: str) -> dict:
        """Get agent info by name, with caching.

        Args:
            agent_name: Name of the hosted agent

        Returns:
            Agent info dict with id, model, and definition
        """
        if agent_name in self._agents_cache:
            return self._agents_cache[agent_name]

        client = await self._ensure_client()

        try:
            # Get agent from AIProjectClient
            agent = await client.agents.get(agent_name=agent_name)

            # Get latest version details
            versions = client.agents.list_versions(agent_name=agent_name)
            latest_version = None
            async for v in versions:
                latest_version = v
                break

            agent_info = {
                "id": agent.id,
                "name": agent.name,
                "version": latest_version.version if latest_version else None,
                "model": getattr(latest_version.definition, "model", None) if latest_version else None,
                "definition": latest_version.definition if latest_version else None,
            }

            self._agents_cache[agent_name] = agent_info
            logger.debug(f"Found agent '{agent_name}' v{agent_info['version']} (model: {agent_info['model']})")
            return agent_info

        except Exception as e:
            raise ValueError(f"Agent not found: {agent_name}") from e

    async def _run_agent_with_retry(
        self,
        agent_name: str,
        message: str,
        run_logger: RunbookLogger,
    ) -> tuple[str, str]:
        """Run a hosted agent with retry logic.

        For hosted agents, we use the OpenAI chat completions API with
        the agent's model and instructions. The MCP tools configured on
        the agent are invoked automatically by the model.

        Args:
            agent_name: Name of the agent to run
            message: Input message for the agent
            run_logger: Logger with run context

        Returns:
            Tuple of (response_content, tool_run_id)
        """
        agent_info = await self._get_agent_info(agent_name)

        max_retries = self.settings.max_retries
        retry_delay = self.settings.retry_delay_seconds
        backoff = self.settings.retry_backoff_factor

        last_error: Optional[Exception] = None
        tool_run_id = f"hosted-{agent_name}-{uuid.uuid4().hex[:8]}"

        for attempt in range(max_retries):
            try:
                run_logger.tool_called(agent_name, f"run_id={tool_run_id}")

                # Get the OpenAI client (uses Azure OpenAI endpoint)
                openai_client = self._get_openai_client()

                # Get agent instructions
                instructions = ""
                if agent_info.get("definition"):
                    instructions = getattr(agent_info["definition"], "instructions", "") or ""

                # Get model from agent definition
                model = agent_info.get("model") or "gpt-5-nano"

                # Build messages with system instructions
                messages = []
                if instructions:
                    messages.append({"role": "system", "content": instructions})
                messages.append({"role": "user", "content": message})

                # Call the model using OpenAI API
                # Note: max_completion_tokens is used for newer models
                response = await openai_client.chat.completions.create(
                    model=model,
                    messages=messages,
                    max_completion_tokens=4096,
                )

                tool_run_id = f"chatcmpl-{response.id}"
                content = response.choices[0].message.content
                return content, tool_run_id

            except Exception as e:
                last_error = e
                run_logger.warning(f"Agent call failed (attempt {attempt + 1}/{max_retries}): {e}")

                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    retry_delay *= backoff

        raise last_error or RuntimeError("Agent call failed after retries")

    # =========================================================================
    # Dry-Run Stubs
    # =========================================================================

    def _stub_sanctions_response(self, beneficiary_name: str) -> SanctionsResult:
        """Generate stubbed sanctions response for dry-run mode."""
        # Simulate BLOCK for known test cases
        if "MASKAN" in beneficiary_name.upper() or "SINALOA" in beneficiary_name.upper():
            return SanctionsResult(
                beneficiary_screened=beneficiary_name,
                decision=SanctionsDecision.BLOCK,
                confidence=98,
                match_type="EXACT",
                match_details={
                    "matched_entity": beneficiary_name,
                    "programs": ["IRAN", "IRAN-EO13902"],
                    "entity_type": "Entity",
                },
                recommendation="REJECT payment immediately. Generate compliance case.",
                pass_to_next_agent=False,
                tool_run_id=f"stub-sanctions-{uuid.uuid4().hex[:8]}",
                audit={
                    "run_id": f"stub-{uuid.uuid4().hex[:8]}",
                    "timestamp_utc": datetime.now(timezone.utc).isoformat(),
                    "index_queried": "idx-ofac-sdn-v1 (STUB)",
                },
            )

        # Default CLEAR response
        return SanctionsResult(
            beneficiary_screened=beneficiary_name,
            decision=SanctionsDecision.CLEAR,
            confidence=100,
            match_type="NONE",
            match_details=None,
            recommendation="No sanctions match. Payment may proceed to liquidity screening.",
            pass_to_next_agent=True,
            tool_run_id=f"stub-sanctions-{uuid.uuid4().hex[:8]}",
            audit={
                "run_id": f"stub-{uuid.uuid4().hex[:8]}",
                "timestamp_utc": datetime.now(timezone.utc).isoformat(),
                "index_queried": "idx-ofac-sdn-v1 (STUB)",
            },
        )

    def _stub_liquidity_response(
        self,
        amount: float,
        currency: str,
        entity: str,
    ) -> LiquidityResult:
        """Generate stubbed liquidity response for dry-run mode."""
        # Simulate breach for large amounts
        breach = amount > 200000

        buffer_threshold = 2000000 if currency == "USD" else 1500000
        projected_balance = 3500000 - amount - 1375000  # Simulated calculation

        return LiquidityResult(
            payment_assessed={
                "amount": amount,
                "currency": currency,
                "entity": entity,
            },
            breach_assessment={
                "breach": breach,
                "first_breach_time": "2026-01-30T14:30:00Z" if breach else None,
                "gap": max(0, buffer_threshold - projected_balance) if breach else 0,
                "projected_min_balance": projected_balance,
                "buffer_threshold": buffer_threshold,
                "headroom": projected_balance - buffer_threshold,
            },
            account_summary={
                "start_of_day_balance": 3500000,
                "total_outflow": amount + 1375000,
                "total_inflow": 250000,
                "net_flow": -(amount + 1375000 - 250000),
                "end_of_day_balance": projected_balance,
            },
            recommendation={
                "action": "HOLD" if breach else "RELEASE",
                "reason": f"Payment would breach buffer by ${buffer_threshold - projected_balance:,.0f}" if breach else "Sufficient liquidity available",
                "alternatives": [
                    "Delay payment until inflows received",
                    "Request partial release",
                    "Escalate to treasury for funding",
                ] if breach else [],
            },
            pass_to_next_agent=True,
            tool_run_id=f"stub-liquidity-{uuid.uuid4().hex[:8]}",
            audit={
                "run_id": f"stub-{uuid.uuid4().hex[:8]}",
                "timestamp_utc": datetime.now(timezone.utc).isoformat(),
                "data_source": "PostgreSQL (STUB)",
                "cutoff_time": "16:00",
            },
        )

    def _stub_procedures_response(
        self,
        sanctions_decision: str,
        liquidity_breach: bool,
        amount: float,
    ) -> ProceduresResult:
        """Generate stubbed procedures response for dry-run mode."""
        # Determine action based on inputs
        if sanctions_decision == "BLOCK":
            action = "REJECT"
            reason = "Sanctions BLOCK decision requires immediate rejection"
        elif sanctions_decision == "ESCALATE":
            action = "HOLD"
            reason = "Sanctions ESCALATE requires compliance review"
        elif liquidity_breach:
            action = "HOLD"
            reason = "Liquidity breach detected, requires Treasury Manager approval"
        else:
            action = "PROCEED"
            reason = "All checks passed, payment may proceed"

        return ProceduresResult(
            input_summary={
                "sanctions_decision": sanctions_decision,
                "liquidity_breach": liquidity_breach,
                "amount_usd": amount,
            },
            workflow_determination={
                "final_action": action,
                "reason": reason,
                "policy_reference": "runbook_emergency_payment.md Section 6.1",
            },
            required_approvals=[
                ApprovalRequired(
                    role="Treasury Manager",
                    authority="Evaluate hold/release options",
                    sla_hours=2,
                ),
                ApprovalRequired(
                    role="Head of Treasury",
                    authority="Secondary approval for override",
                    sla_hours=4,
                ),
            ] if action == "HOLD" else [
                ApprovalRequired(
                    role="Payments Operator",
                    authority="Execute payment release",
                    sla_hours=1,
                ),
            ],
            workflow_steps=[
                WorkflowStepChecklist(
                    step_number=1,
                    action=f"{action} the payment",
                    responsible="System (automatic)",
                    documentation_required="Status timestamp, reason code",
                ),
                WorkflowStepChecklist(
                    step_number=2,
                    action="Notify relevant approvers",
                    responsible="System (automatic)",
                    documentation_required="Notification timestamp",
                ),
                WorkflowStepChecklist(
                    step_number=3,
                    action="Execute final decision",
                    responsible="Payments Operator",
                    documentation_required="Final status, execution timestamp",
                ),
            ],
            audit_bundle={
                "required_documents": [
                    "Original payment instruction",
                    "Sanctions screening result",
                    "Liquidity impact assessment",
                    "Approval chain with timestamps",
                ],
                "retention_period": "7 years",
                "regulatory_filings": [],
            },
            escalation_contacts={
                "primary": "treasury-manager@bank.local",
                "backup": "treasury-backup@bank.local",
            },
            citations=[
                Citation(
                    source="runbook_emergency_payment.md",
                    snippet="Per Section 6.1, payments with liquidity breach must be held pending approval",
                    reference="runbook_emergency_payment.md#section-6.1",
                ),
                Citation(
                    source="policy_approval_matrix.md",
                    snippet="Amounts > USD 100,000 require Treasury Manager approval",
                    reference="policy_approval_matrix.md#authority-limits",
                ),
            ],
            tool_run_id=f"stub-procedures-{uuid.uuid4().hex[:8]}",
            audit={
                "run_id": f"stub-{uuid.uuid4().hex[:8]}",
                "timestamp_utc": datetime.now(timezone.utc).isoformat(),
                "policies_consulted": [
                    "runbook_emergency_payment.md",
                    "policy_approval_matrix.md",
                    "policy_sod_controls.md",
                ],
            },
        )

    # =========================================================================
    # Agent Call Methods
    # =========================================================================

    async def run_sanctions_screening(
        self,
        beneficiary_name: str,
        payment_context: dict[str, Any],
        run_logger: RunbookLogger,
    ) -> SanctionsResult:
        """Run sanctions screening agent.

        Args:
            beneficiary_name: Name of payment beneficiary
            payment_context: Payment details for context
            run_logger: Logger with run context

        Returns:
            SanctionsResult with decision
        """
        run_logger.set_context(step="sanctions", agent=self.settings.azure_foundry_agent_sanctions)

        # Dry-run mode
        if is_dry_run():
            run_logger.info("Using stubbed sanctions response (dry-run mode)")
            await asyncio.sleep(1.5)  # Simulate latency
            return self._stub_sanctions_response(beneficiary_name)

        # Build prompt
        prompt = f"""Screen the following payment beneficiary for sanctions:

Beneficiary Name: {beneficiary_name}
Payment Context: {json.dumps(payment_context, indent=2)}

Please perform sanctions screening against the OFAC SDN list and return your assessment as JSON.
"""

        try:
            response, tool_run_id = await self._run_agent_with_retry(
                agent_name=self.settings.azure_foundry_agent_sanctions,
                message=prompt,
                run_logger=run_logger,
            )

            # Parse response
            result = self._parse_sanctions_response(response, beneficiary_name, tool_run_id)
            run_logger.info(f"Sanctions decision: {result.decision.value} (confidence: {result.confidence}%)")
            return result

        except Exception as e:
            run_logger.error(f"Sanctions screening failed: {e}")
            # Return ESCALATE on error (safe fallback)
            return SanctionsResult(
                beneficiary_screened=beneficiary_name,
                decision=SanctionsDecision.ESCALATE,
                confidence=0,
                match_type="ERROR",
                recommendation="System error - manual review required",
                pass_to_next_agent=False,
                audit={"error": str(e)},
            )

    async def run_liquidity_screening(
        self,
        payment_context: dict[str, Any],
        run_logger: RunbookLogger,
    ) -> LiquidityResult:
        """Run liquidity screening agent.

        Args:
            payment_context: Payment details
            run_logger: Logger with run context

        Returns:
            LiquidityResult with breach assessment
        """
        run_logger.set_context(step="liquidity", agent=self.settings.azure_foundry_agent_liquidity)

        # Dry-run mode
        if is_dry_run():
            run_logger.info("Using stubbed liquidity response (dry-run mode)")
            await asyncio.sleep(1.5)  # Simulate latency
            return self._stub_liquidity_response(
                amount=payment_context.get("amount", 0),
                currency=payment_context.get("currency", "USD"),
                entity=payment_context.get("entity", "BankSubsidiary_TR"),
            )

        # Build prompt
        prompt = f"""Assess the liquidity impact for the following payment:

Payment Details:
{json.dumps(payment_context, indent=2)}

Please compute the liquidity impact and determine if this payment would breach buffer thresholds.
Return your assessment as JSON.
"""

        try:
            response, tool_run_id = await self._run_agent_with_retry(
                agent_name=self.settings.azure_foundry_agent_liquidity,
                message=prompt,
                run_logger=run_logger,
            )

            result = self._parse_liquidity_response(response, payment_context, tool_run_id)
            breach = result.breach_assessment.get("breach", False)
            run_logger.info(f"Liquidity assessment: {'BREACH' if breach else 'NO_BREACH'}")
            return result

        except Exception as e:
            run_logger.error(f"Liquidity screening failed: {e}")
            # Return ESCALATE-triggering result on error
            return LiquidityResult(
                payment_assessed=payment_context,
                breach_assessment={"breach": True, "error": str(e)},
                account_summary={},
                recommendation={
                    "action": "ESCALATE",
                    "reason": "System degradation - liquidity check unavailable",
                    "alternatives": ["Manual liquidity verification required"],
                },
                pass_to_next_agent=True,
                audit={"error": str(e), "degraded_mode": True},
            )

    async def run_operational_procedures(
        self,
        payment_context: dict[str, Any],
        sanctions_result: SanctionsResult,
        liquidity_result: LiquidityResult,
        run_logger: RunbookLogger,
    ) -> ProceduresResult:
        """Run operational procedures agent.

        Args:
            payment_context: Payment details
            sanctions_result: Output from sanctions screening
            liquidity_result: Output from liquidity screening
            run_logger: Logger with run context

        Returns:
            ProceduresResult with workflow determination
        """
        run_logger.set_context(step="procedures", agent=self.settings.azure_foundry_agent_procedures)

        # Dry-run mode
        if is_dry_run():
            run_logger.info("Using stubbed procedures response (dry-run mode)")
            await asyncio.sleep(2.0)  # Simulate latency
            return self._stub_procedures_response(
                sanctions_decision=sanctions_result.decision.value,
                liquidity_breach=liquidity_result.breach_assessment.get("breach", False),
                amount=payment_context.get("amount", 0),
            )

        # Build prompt
        prompt = f"""Based on the following screening results, determine the operational workflow:

Payment Request:
{json.dumps(payment_context, indent=2)}

Sanctions Screening Result:
{json.dumps(sanctions_result.model_dump(), indent=2)}

Liquidity Screening Result:
{json.dumps(liquidity_result.model_dump(), indent=2)}

Please query the treasury knowledge base and determine:
1. Required approvers based on the decision matrix
2. Workflow steps to follow
3. Documentation requirements for audit
4. Relevant policy citations

Return your assessment as JSON with citations from the knowledge base.
"""

        try:
            response, tool_run_id = await self._run_agent_with_retry(
                agent_name=self.settings.azure_foundry_agent_procedures,
                message=prompt,
                run_logger=run_logger,
            )

            result = self._parse_procedures_response(response, tool_run_id)
            action = result.workflow_determination.get("final_action", "UNKNOWN")
            run_logger.info(f"Procedures determination: {action}")
            return result

        except Exception as e:
            run_logger.error(f"Operational procedures failed: {e}")
            # Return safe HOLD on error
            return ProceduresResult(
                input_summary={
                    "sanctions_decision": sanctions_result.decision.value,
                    "liquidity_breach": liquidity_result.breach_assessment.get("breach", False),
                },
                workflow_determination={
                    "final_action": "HOLD",
                    "reason": "System degradation - manual review required",
                    "policy_reference": "emergency_fallback",
                },
                required_approvals=[
                    ApprovalRequired(
                        role="Compliance Officer",
                        authority="Full manual review required",
                        sla_hours=4,
                    ),
                ],
                workflow_steps=[
                    WorkflowStepChecklist(
                        step_number=1,
                        action="HOLD for manual review",
                        responsible="System",
                        documentation_required="Error details",
                    ),
                ],
                audit_bundle={"error": str(e)},
                escalation_contacts={},
                citations=[],
                audit={"error": str(e), "degraded_mode": True},
            )

    # =========================================================================
    # Response Parsing
    # =========================================================================

    def _parse_sanctions_response(
        self,
        response: str,
        beneficiary_name: str,
        tool_run_id: str,
    ) -> SanctionsResult:
        """Parse sanctions agent response into structured result."""
        try:
            # Try to extract JSON from response
            data = self._extract_json(response)

            return SanctionsResult(
                beneficiary_screened=data.get("beneficiary_screened", beneficiary_name),
                decision=SanctionsDecision(data.get("decision", "ESCALATE")),
                confidence=data.get("confidence", 0),
                match_type=data.get("match_type", "UNKNOWN"),
                match_details=data.get("match_details"),
                recommendation=data.get("recommendation", ""),
                pass_to_next_agent=data.get("pass_to_next_agent", False),
                tool_run_id=tool_run_id,
                audit=data.get("audit", {}),
            )
        except Exception as e:
            logger.warning(f"Failed to parse sanctions response: {e}")
            return SanctionsResult(
                beneficiary_screened=beneficiary_name,
                decision=SanctionsDecision.ESCALATE,
                confidence=0,
                match_type="PARSE_ERROR",
                recommendation="Parse error - manual review required",
                pass_to_next_agent=False,
                tool_run_id=tool_run_id,
                audit={"parse_error": str(e), "raw_response": response[:500]},
            )

    def _parse_liquidity_response(
        self,
        response: str,
        payment_context: dict[str, Any],
        tool_run_id: str,
    ) -> LiquidityResult:
        """Parse liquidity agent response into structured result."""
        try:
            data = self._extract_json(response)

            return LiquidityResult(
                payment_assessed=data.get("payment_assessed", payment_context),
                breach_assessment=data.get("breach_assessment", {}),
                account_summary=data.get("account_summary", {}),
                recommendation=data.get("recommendation", {}),
                pass_to_next_agent=data.get("pass_to_next_agent", True),
                tool_run_id=tool_run_id,
                audit=data.get("audit", {}),
            )
        except Exception as e:
            logger.warning(f"Failed to parse liquidity response: {e}")
            return LiquidityResult(
                payment_assessed=payment_context,
                breach_assessment={"breach": True, "parse_error": str(e)},
                account_summary={},
                recommendation={"action": "HOLD", "reason": "Parse error"},
                pass_to_next_agent=True,
                tool_run_id=tool_run_id,
                audit={"parse_error": str(e)},
            )

    def _parse_procedures_response(
        self,
        response: str,
        tool_run_id: str,
    ) -> ProceduresResult:
        """Parse procedures agent response into structured result."""
        try:
            data = self._extract_json(response)

            # Parse approvals
            approvals = []
            for a in data.get("required_approvals", []):
                approvals.append(ApprovalRequired(
                    role=a.get("role", "Unknown"),
                    authority=a.get("authority", ""),
                    sla_hours=a.get("sla_hours", 4),
                ))

            # Parse workflow steps
            steps = []
            for s in data.get("workflow_steps", []):
                steps.append(WorkflowStepChecklist(
                    step_number=s.get("step", s.get("step_number", 0)),
                    action=s.get("action", ""),
                    responsible=s.get("responsible", ""),
                    documentation_required=s.get("documentation_required", ""),
                ))

            # Parse citations
            citations = []
            for c in data.get("citations", []):
                citations.append(Citation(
                    source=c.get("source", ""),
                    snippet=c.get("snippet", ""),
                    reference=c.get("reference", ""),
                ))

            return ProceduresResult(
                input_summary=data.get("input_summary", {}),
                workflow_determination=data.get("workflow_determination", {}),
                required_approvals=approvals,
                workflow_steps=steps,
                audit_bundle=data.get("audit_bundle", {}),
                escalation_contacts=data.get("escalation_contacts", {}),
                citations=citations,
                tool_run_id=tool_run_id,
                audit=data.get("audit", {}),
            )
        except Exception as e:
            logger.warning(f"Failed to parse procedures response: {e}")
            return ProceduresResult(
                input_summary={},
                workflow_determination={"final_action": "HOLD", "reason": "Parse error"},
                required_approvals=[],
                workflow_steps=[],
                audit_bundle={},
                escalation_contacts={},
                citations=[],
                tool_run_id=tool_run_id,
                audit={"parse_error": str(e)},
            )

    def _extract_json(self, text: str) -> dict[str, Any]:
        """Extract JSON from text that may contain markdown code blocks or multiple JSON objects."""
        import re

        # Try direct parse first
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try to extract from code block
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        # Find all potential JSON objects by looking for balanced braces
        # This handles cases where there are multiple JSON objects in the response
        candidates = []
        depth = 0
        start_idx = -1

        for i, char in enumerate(text):
            if char == '{':
                if depth == 0:
                    start_idx = i
                depth += 1
            elif char == '}':
                depth -= 1
                if depth == 0 and start_idx != -1:
                    candidate = text[start_idx:i + 1]
                    try:
                        parsed = json.loads(candidate)
                        candidates.append(parsed)
                    except json.JSONDecodeError:
                        pass
                    start_idx = -1

        # Return the best candidate (prefer one with 'decision' or 'agent' fields)
        for candidate in candidates:
            if 'decision' in candidate or 'agent' in candidate or 'workflow_determination' in candidate:
                return candidate

        # If no preferred candidate, return the largest one
        if candidates:
            return max(candidates, key=lambda x: len(str(x)))

        raise ValueError("No valid JSON found in response")


# Singleton client instance
_foundry_client: Optional[FoundryAgentClient] = None


def get_foundry_client() -> FoundryAgentClient:
    """Get the Foundry client singleton instance."""
    global _foundry_client
    if _foundry_client is None:
        _foundry_client = FoundryAgentClient()
    return _foundry_client
