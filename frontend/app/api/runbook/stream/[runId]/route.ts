import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  // Create a TransformStream to pipe the SSE events
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch(`${BACKEND_URL}/api/runbook/stream/${runId}`, {
          headers: {
            Accept: "text/event-stream",
          },
        });

        if (!response.ok) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Failed to connect to backend" })}\n\n`)
          );
          controller.close();
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", message: "No response body" })}\n\n`)
          );
          controller.close();
          return;
        }

        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          controller.enqueue(encoder.encode(chunk));
        }

        controller.close();
      } catch (error) {
        console.error("SSE proxy error:", error);

        // Send demo events when backend is not available
        const scenario = selectScenario(runId);
        const demoEvents = generateDemoEvents(runId, scenario);
        for (const event of demoEvents) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          await new Promise((resolve) => setTimeout(resolve, 1200 + Math.random() * 800));
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// Different scenarios for demo mode
type Scenario = "clean_release" | "conditional_release" | "partial_release" | "hold_approval" | "hold_documentation" | "escalate_compliance" | "reject_sanctions" | "reject_liquidity";

function selectScenario(runId: string): Scenario {
  // Use runId hash to deterministically select scenario for consistent demos
  const hash = runId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const scenarios: Scenario[] = [
    "clean_release",
    "conditional_release",
    "partial_release",
    "hold_approval",
    "hold_documentation",
    "escalate_compliance",
    "reject_sanctions",
    "reject_liquidity",
  ];
  return scenarios[hash % scenarios.length];
}

function generateDemoEvents(runId: string, scenario: Scenario) {
  let seq = 0;
  const now = () => new Date().toISOString();
  const futureDate = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

  // Base payment details vary by scenario
  const payments: Record<Scenario, { name: string; amount: number; currency: string; purpose: string }> = {
    clean_release: { name: "ACME Corp Inc", amount: 150000, currency: "USD", purpose: "Q4 supplies" },
    conditional_release: { name: "Global Partners Ltd", amount: 350000, currency: "USD", purpose: "Equipment purchase" },
    partial_release: { name: "Tech Solutions GmbH", amount: 750000, currency: "EUR", purpose: "Software licensing" },
    hold_approval: { name: "Strategic Ventures LLC", amount: 500000, currency: "USD", purpose: "Consulting services" },
    hold_documentation: { name: "Import Export Co", amount: 280000, currency: "USD", purpose: "Trade finance" },
    escalate_compliance: { name: "Eastern Trading Corp", amount: 420000, currency: "USD", purpose: "Cross-border settlement" },
    reject_sanctions: { name: "Restricted Entity Ltd", amount: 200000, currency: "USD", purpose: "Investment" },
    reject_liquidity: { name: "Major Holdings Inc", amount: 4500000, currency: "USD", purpose: "Acquisition payment" },
  };

  const payment = payments[scenario];
  const events: unknown[] = [];

  // Intake step (common to all)
  events.push({
    run_id: runId,
    seq: seq++,
    type: "step_started",
    step: "intake",
    agent: "IntakeAgent",
    ts: now(),
  });

  events.push({
    run_id: runId,
    seq: seq++,
    type: "step_completed",
    step: "intake",
    agent: "IntakeAgent",
    ts: now(),
    elapsed_ms: 650 + Math.floor(Math.random() * 400),
    payload: {
      summary: "Payment request parsed and validated",
      payment: {
        payment_id: `PAY-${Date.now()}`,
        beneficiary_name: payment.name,
        amount: payment.amount,
        currency: payment.currency,
        purpose: payment.purpose,
        beneficiary_country: scenario === "escalate_compliance" ? "CN" : scenario === "reject_sanctions" ? "RU" : "US",
        urgency: payment.amount > 400000 ? "urgent" : "standard",
      },
    },
  });

  // Sanctions step
  events.push({
    run_id: runId,
    seq: seq++,
    type: "step_started",
    step: "sanctions",
    agent: "SanctionsAgent",
    ts: now(),
  });

  const sanctionsResult = getSanctionsResult(scenario, payment.name);
  events.push({
    run_id: runId,
    seq: seq++,
    type: "step_completed",
    step: "sanctions",
    agent: "SanctionsAgent",
    ts: now(),
    elapsed_ms: 1100 + Math.floor(Math.random() * 500),
    payload: {
      summary: sanctionsResult.summary,
      ...sanctionsResult.details,
    },
  });

  // Liquidity step
  events.push({
    run_id: runId,
    seq: seq++,
    type: "step_started",
    step: "liquidity",
    agent: "LiquidityAgent",
    ts: now(),
  });

  const liquidityResult = getLiquidityResult(scenario, payment.amount);
  events.push({
    run_id: runId,
    seq: seq++,
    type: "step_completed",
    step: "liquidity",
    agent: "LiquidityAgent",
    ts: now(),
    elapsed_ms: 550 + Math.floor(Math.random() * 300),
    payload: {
      summary: liquidityResult.summary,
      ...liquidityResult.details,
    },
  });

  // Procedures step
  events.push({
    run_id: runId,
    seq: seq++,
    type: "step_started",
    step: "procedures",
    agent: "ProceduresAgent",
    ts: now(),
  });

  const proceduresResult = getProceduresResult(scenario, payment.amount);
  events.push({
    run_id: runId,
    seq: seq++,
    type: "step_completed",
    step: "procedures",
    agent: "ProceduresAgent",
    ts: now(),
    elapsed_ms: 800 + Math.floor(Math.random() * 400),
    payload: {
      summary: proceduresResult.summary,
      ...proceduresResult.details,
    },
  });

  // Summary/Decision step
  events.push({
    run_id: runId,
    seq: seq++,
    type: "step_started",
    step: "summarize",
    agent: "DecisionAgent",
    ts: now(),
  });

  const decisionPacket = generateDecisionPacket(scenario, payment, runId, futureDate);
  events.push({
    run_id: runId,
    seq: seq++,
    type: "final",
    step: "summarize",
    agent: "DecisionAgent",
    ts: now(),
    elapsed_ms: 600 + Math.floor(Math.random() * 300),
    payload: {
      decision_packet: decisionPacket,
    },
  });

  return events;
}

function getSanctionsResult(scenario: Scenario, beneficiaryName: string) {
  if (scenario === "reject_sanctions") {
    return {
      summary: "POTENTIAL MATCH DETECTED - Manual review required",
      details: {
        status: "POTENTIAL_MATCH",
        confidence: 78,
        matches: [
          {
            list: "OFAC SDN",
            matched_name: "Restricted Entity Limited",
            match_score: 85,
            match_type: "fuzzy",
            programs: ["RUSSIA-EO14024"],
          },
        ],
        lists_checked: ["OFAC SDN", "EU Sanctions", "UN Consolidated", "OFAC Sectoral"],
      },
    };
  }

  if (scenario === "escalate_compliance") {
    return {
      summary: "Clear but elevated risk geography - compliance review recommended",
      details: {
        status: "REVIEW_REQUIRED",
        confidence: 92,
        matches: [],
        lists_checked: ["OFAC SDN", "EU Sanctions", "UN Consolidated"],
        risk_factors: ["High-risk jurisdiction", "First-time beneficiary"],
      },
    };
  }

  return {
    summary: "No sanctions matches found - cleared for processing",
    details: {
      status: "CLEAR",
      confidence: 99,
      matches: [],
      lists_checked: ["OFAC SDN", "EU Sanctions", "UN Consolidated", "OFAC Sectoral"],
    },
  };
}

function getLiquidityResult(scenario: Scenario, amount: number) {
  const baseBalance = 5000000;
  const bufferThreshold = 1000000;

  if (scenario === "reject_liquidity") {
    return {
      summary: "INSUFFICIENT LIQUIDITY - Payment exceeds available funds minus buffer",
      details: {
        status: "INSUFFICIENT",
        available_balance: baseBalance,
        requested_amount: amount,
        buffer_threshold: bufferThreshold,
        post_transaction_balance: baseBalance - amount,
        buffer_utilization_pct: 112,
      },
    };
  }

  if (scenario === "partial_release") {
    return {
      summary: "Partial liquidity available - split payment recommended",
      details: {
        status: "MARGINAL",
        available_balance: baseBalance,
        requested_amount: amount,
        buffer_threshold: bufferThreshold,
        post_transaction_balance: baseBalance - amount,
        buffer_utilization_pct: 85,
        recommended_split: [400000, 350000],
      },
    };
  }

  return {
    summary: "Sufficient liquidity available - buffer threshold maintained",
    details: {
      status: "SUFFICIENT",
      available_balance: baseBalance,
      requested_amount: amount,
      buffer_threshold: bufferThreshold,
      post_transaction_balance: baseBalance - amount,
      buffer_utilization_pct: Math.round((amount / (baseBalance - bufferThreshold)) * 100),
    },
  };
}

function getProceduresResult(scenario: Scenario, amount: number) {
  if (scenario === "hold_approval") {
    return {
      summary: "Executive approval required - amount exceeds standard threshold",
      details: {
        approval_tier: "executive",
        dual_control_required: true,
        four_eyes_required: true,
        documentation_status: "complete",
        missing_documents: [],
      },
    };
  }

  if (scenario === "hold_documentation") {
    return {
      summary: "Documentation incomplete - pending required documents",
      details: {
        approval_tier: "standard",
        dual_control_required: false,
        documentation_status: "partial",
        missing_documents: ["Invoice copy", "Beneficiary bank confirmation"],
      },
    };
  }

  if (amount > 250000) {
    return {
      summary: "Elevated approval required - dual authorization needed",
      details: {
        approval_tier: "elevated",
        dual_control_required: true,
        four_eyes_required: false,
        documentation_status: "complete",
        missing_documents: [],
      },
    };
  }

  return {
    summary: "Standard approval workflow applicable",
    details: {
      approval_tier: "standard",
      dual_control_required: false,
      four_eyes_required: false,
      documentation_status: "complete",
      missing_documents: [],
    },
  };
}

function generateDecisionPacket(
  scenario: Scenario,
  payment: { name: string; amount: number; currency: string; purpose: string },
  runId: string,
  futureDate: (hours: number) => string
) {
  const basePacket = {
    run_id: runId,
    timestamp: new Date().toISOString(),
    processing_time_ms: 4200 + Math.floor(Math.random() * 1000),
  };

  switch (scenario) {
    case "clean_release":
      return {
        ...basePacket,
        decision: "RELEASE",
        decision_category: "release",
        risk_score: 12,
        risk_level: "low",
        risk_factors: [
          { category: "sanctions", factor: "Clean screening", impact: "low", score_contribution: 0 },
          { category: "liquidity", factor: "Strong buffer", impact: "low", score_contribution: 5 },
          { category: "operational", factor: "Standard amount", impact: "low", score_contribution: 7 },
        ],
        confidence_score: 96,
        summary: `Payment of ${payment.currency} ${payment.amount.toLocaleString()} to ${payment.name} approved for immediate processing.`,
        rationale: [
          `Beneficiary ${payment.name} cleared all sanctions screenings with 99% confidence`,
          `Sufficient liquidity maintains healthy buffer above threshold`,
          `Transaction within standard approval limits - automated release authorized`,
        ],
        conditions: [],
        approvals_required: [
          { sequence: 1, role: "Operations Manager", authority_level: "Standard (<$250K)", sla_hours: 4, can_delegate: true, status: "approved", approved_by: "System", approved_at: new Date().toISOString() },
        ],
        required_documents: [
          { id: "DOC-1", name: "Payment Request Form", type: "authorization", status: "received" },
          { id: "DOC-2", name: "Beneficiary KYC", type: "kyc", status: "received" },
        ],
        procedure_checklist: [
          { step_number: 1, action: "Verify beneficiary identification", responsible: "Operations", documentation_required: "KYC documentation", status: "completed" },
          { step_number: 2, action: "Complete sanctions screening", responsible: "Compliance", documentation_required: "Screening report", status: "completed" },
          { step_number: 3, action: "Verify liquidity availability", responsible: "Treasury", documentation_required: "Balance confirmation", status: "completed" },
          { step_number: 4, action: "Execute payment", responsible: "Treasury", documentation_required: "Payment confirmation", status: "pending" },
        ],
        sod_constraints: [
          { id: "SOD-1", description: "Initiator ≠ Approver", satisfied: true },
        ],
        policy_citations: [
          { id: "CIT-1", source: "Emergency Payment Procedures", section: "3.2", snippet: "Payments under $250,000 may be processed with single-level approval when all compliance checks pass.", relevance: "primary" },
        ],
      };

    case "conditional_release":
      return {
        ...basePacket,
        decision: "RELEASE_WITH_CONDITIONS",
        decision_category: "release",
        risk_score: 35,
        risk_level: "medium",
        risk_factors: [
          { category: "sanctions", factor: "Clean screening", impact: "low", score_contribution: 5 },
          { category: "liquidity", factor: "Adequate buffer", impact: "low", score_contribution: 10 },
          { category: "operational", factor: "Elevated amount", impact: "medium", score_contribution: 20 },
        ],
        confidence_score: 88,
        summary: `Payment approved with conditions - dual authorization required before release.`,
        rationale: [
          `Beneficiary ${payment.name} passed sanctions screening`,
          `Amount ${payment.currency} ${payment.amount.toLocaleString()} exceeds standard threshold`,
          `Dual control authorization required per policy`,
        ],
        conditions: [
          { id: "COND-1", type: "approval", description: "Second authorized signatory must approve", required: true, satisfied: false, deadline: futureDate(4) },
          { id: "COND-2", type: "verification", description: "Confirm beneficiary bank details via callback", required: true, satisfied: false, responsible_party: "Operations" },
        ],
        approvals_required: [
          { sequence: 1, role: "Operations Manager", authority_level: "Elevated ($250K-$500K)", sla_hours: 4, can_delegate: true, status: "pending" },
          { sequence: 2, role: "Treasury Director", authority_level: "Dual Control", sla_hours: 2, can_delegate: false, status: "pending" },
        ],
        required_documents: [
          { id: "DOC-1", name: "Payment Request Form", type: "authorization", status: "received" },
          { id: "DOC-2", name: "Beneficiary KYC", type: "kyc", status: "received" },
          { id: "DOC-3", name: "Supporting Invoice", type: "invoice", status: "received" },
        ],
        procedure_checklist: [
          { step_number: 1, action: "Verify beneficiary identification", responsible: "Operations", documentation_required: "KYC documentation", status: "completed" },
          { step_number: 2, action: "Complete sanctions screening", responsible: "Compliance", documentation_required: "Screening report", status: "completed" },
          { step_number: 3, action: "Verify liquidity availability", responsible: "Treasury", documentation_required: "Balance confirmation", status: "completed" },
          { step_number: 4, action: "Obtain first approval", responsible: "Operations Manager", documentation_required: "Approval signature", status: "pending" },
          { step_number: 5, action: "Obtain second approval (dual control)", responsible: "Treasury Director", documentation_required: "Dual control signature", status: "pending" },
          { step_number: 6, action: "Execute payment", responsible: "Treasury", documentation_required: "Payment confirmation", status: "pending" },
        ],
        sod_constraints: [
          { id: "SOD-1", description: "Initiator ≠ Approver", satisfied: true },
          { id: "SOD-2", description: "First approver ≠ Second approver", satisfied: true },
        ],
        policy_citations: [
          { id: "CIT-1", source: "Treasury Operations Manual", section: "4.3", snippet: "Payments between $250,000 and $500,000 require dual control authorization.", relevance: "primary" },
        ],
      };

    case "partial_release":
      return {
        ...basePacket,
        decision: "PARTIAL_RELEASE",
        decision_category: "release",
        risk_score: 45,
        risk_level: "medium",
        risk_factors: [
          { category: "liquidity", factor: "Buffer strain", impact: "medium", score_contribution: 25 },
          { category: "operational", factor: "Large amount", impact: "medium", score_contribution: 20 },
        ],
        confidence_score: 82,
        summary: `Partial release recommended - ${payment.currency} 400,000 approved, remainder deferred.`,
        rationale: [
          `Full amount of ${payment.currency} ${payment.amount.toLocaleString()} would reduce buffer below comfort level`,
          `Partial release of ${payment.currency} 400,000 maintains adequate liquidity buffer`,
          `Remaining ${payment.currency} 350,000 scheduled for next funding cycle`,
        ],
        approved_amount: 400000,
        held_amount: 350000,
        release_tranches: [
          { tranche_number: 1, amount: 400000, release_date: new Date().toISOString(), conditions: ["Immediate upon approval"], status: "scheduled" },
          { tranche_number: 2, amount: 350000, release_date: futureDate(48), conditions: ["Pending funding confirmation"], status: "held" },
        ],
        conditions: [
          { id: "COND-1", type: "approval", description: "CFO approval for split payment arrangement", required: true, satisfied: false },
          { id: "COND-2", type: "other", description: "Beneficiary acknowledgment of partial payment", required: true, satisfied: false },
        ],
        approvals_required: [
          { sequence: 1, role: "Treasury Director", authority_level: "Split Payment Authority", sla_hours: 4, can_delegate: false, status: "pending" },
          { sequence: 2, role: "CFO", authority_level: "Exception Approval", sla_hours: 8, can_delegate: true, status: "pending" },
        ],
        required_documents: [
          { id: "DOC-1", name: "Split Payment Authorization", type: "authorization", status: "pending" },
        ],
        procedure_checklist: [
          { step_number: 1, action: "Obtain CFO approval for split arrangement", responsible: "Treasury", documentation_required: "Exception approval form", status: "pending" },
          { step_number: 2, action: "Notify beneficiary of partial payment", responsible: "Operations", documentation_required: "Communication record", status: "pending" },
          { step_number: 3, action: "Release first tranche", responsible: "Treasury", documentation_required: "Payment confirmation", status: "pending" },
          { step_number: 4, action: "Schedule second tranche", responsible: "Treasury", documentation_required: "Scheduled payment record", status: "pending" },
        ],
        sod_constraints: [],
        policy_citations: [
          { id: "CIT-1", source: "Liquidity Management Policy", section: "2.4", snippet: "When full payment would breach buffer thresholds, split payments may be authorized by CFO.", relevance: "primary" },
        ],
      };

    case "hold_approval":
      return {
        ...basePacket,
        decision: "HOLD_PENDING_APPROVAL",
        decision_category: "hold",
        risk_score: 38,
        risk_level: "medium",
        risk_factors: [
          { category: "operational", factor: "High value transaction", impact: "medium", score_contribution: 25 },
          { category: "compliance", factor: "Executive approval required", impact: "low", score_contribution: 13 },
        ],
        confidence_score: 91,
        summary: `Payment on hold pending executive approval - amount exceeds departmental authority.`,
        rationale: [
          `Transaction amount ${payment.currency} ${payment.amount.toLocaleString()} exceeds Operations Manager authority`,
          `Executive Committee approval required for amounts over $400,000`,
          `All compliance checks passed - hold is procedural only`,
        ],
        conditions: [
          { id: "COND-1", type: "approval", description: "Executive Committee member must approve", required: true, satisfied: false, deadline: futureDate(24), responsible_party: "Executive Committee" },
        ],
        approvals_required: [
          { sequence: 1, role: "Operations Manager", authority_level: "Initial Review", sla_hours: 2, can_delegate: true, status: "approved", approved_by: "J. Smith", approved_at: new Date().toISOString() },
          { sequence: 2, role: "Executive Committee Member", authority_level: "Executive (>$400K)", sla_hours: 24, can_delegate: false, status: "pending" },
        ],
        required_documents: [
          { id: "DOC-1", name: "Executive Summary", type: "authorization", status: "received" },
          { id: "DOC-2", name: "Business Justification", type: "other", status: "received" },
        ],
        procedure_checklist: [
          { step_number: 1, action: "Prepare executive briefing", responsible: "Operations", documentation_required: "Executive summary", status: "completed" },
          { step_number: 2, action: "Route to Executive Committee", responsible: "Operations Manager", documentation_required: "Approval routing form", status: "in_progress" },
          { step_number: 3, action: "Obtain executive approval", responsible: "Executive Committee", documentation_required: "Executive signature", status: "pending" },
          { step_number: 4, action: "Execute payment", responsible: "Treasury", documentation_required: "Payment confirmation", status: "blocked" },
        ],
        sod_constraints: [
          { id: "SOD-1", description: "Requester ≠ Executive Approver", satisfied: true },
        ],
        policy_citations: [
          { id: "CIT-1", source: "Delegation of Authority Matrix", section: "A.2", snippet: "Payments exceeding $400,000 require Executive Committee approval.", relevance: "primary" },
        ],
        approval_deadline: futureDate(24),
      };

    case "hold_documentation":
      return {
        ...basePacket,
        decision: "HOLD_PENDING_DOCUMENTATION",
        decision_category: "hold",
        risk_score: 42,
        risk_level: "medium",
        risk_factors: [
          { category: "compliance", factor: "Incomplete documentation", impact: "medium", score_contribution: 30 },
          { category: "operational", factor: "Trade finance transaction", impact: "low", score_contribution: 12 },
        ],
        confidence_score: 75,
        summary: `Payment on hold - required supporting documents not yet received.`,
        rationale: [
          `Invoice copy required but not yet provided`,
          `Beneficiary bank confirmation letter pending`,
          `Cannot proceed without complete documentation per trade finance policy`,
        ],
        conditions: [
          { id: "COND-1", type: "document", description: "Provide invoice copy", required: true, satisfied: false, deadline: futureDate(48) },
          { id: "COND-2", type: "document", description: "Provide beneficiary bank confirmation", required: true, satisfied: false, deadline: futureDate(48) },
        ],
        approvals_required: [
          { sequence: 1, role: "Documentation Specialist", authority_level: "Document Review", sla_hours: 4, can_delegate: true, status: "pending" },
        ],
        required_documents: [
          { id: "DOC-1", name: "Payment Request Form", type: "authorization", status: "received" },
          { id: "DOC-2", name: "Invoice Copy", type: "invoice", status: "missing" },
          { id: "DOC-3", name: "Bank Confirmation Letter", type: "other", status: "missing" },
          { id: "DOC-4", name: "Trade Contract", type: "contract", status: "pending" },
        ],
        procedure_checklist: [
          { step_number: 1, action: "Request missing invoice", responsible: "Operations", documentation_required: "Request confirmation", status: "completed" },
          { step_number: 2, action: "Request bank confirmation", responsible: "Operations", documentation_required: "Request confirmation", status: "completed" },
          { step_number: 3, action: "Review received documents", responsible: "Documentation Specialist", documentation_required: "Review checklist", status: "pending" },
          { step_number: 4, action: "Resume payment processing", responsible: "Operations", documentation_required: "N/A", status: "blocked" },
        ],
        sod_constraints: [],
        policy_citations: [
          { id: "CIT-1", source: "Trade Finance Procedures", section: "5.1", snippet: "All trade finance payments require original invoice and beneficiary bank confirmation.", relevance: "primary" },
        ],
      };

    case "escalate_compliance":
      return {
        ...basePacket,
        decision: "ESCALATE_COMPLIANCE",
        decision_category: "escalate",
        risk_score: 62,
        risk_level: "high",
        risk_factors: [
          { category: "sanctions", factor: "High-risk jurisdiction", impact: "high", score_contribution: 35 },
          { category: "compliance", factor: "First-time beneficiary", impact: "medium", score_contribution: 15 },
          { category: "operational", factor: "Cross-border payment", impact: "low", score_contribution: 12 },
        ],
        confidence_score: 68,
        summary: `Escalated to Compliance - high-risk jurisdiction requires enhanced due diligence.`,
        rationale: [
          `Beneficiary located in jurisdiction flagged for elevated AML risk`,
          `First-time transaction with this beneficiary requires enhanced KYC`,
          `Compliance team must perform enhanced due diligence review`,
        ],
        conditions: [
          { id: "COND-1", type: "verification", description: "Complete enhanced due diligence on beneficiary", required: true, satisfied: false, responsible_party: "Compliance" },
          { id: "COND-2", type: "approval", description: "Compliance Officer sign-off", required: true, satisfied: false, deadline: futureDate(72) },
        ],
        approvals_required: [
          { sequence: 1, role: "Compliance Analyst", authority_level: "EDD Review", sla_hours: 24, can_delegate: false, status: "pending" },
          { sequence: 2, role: "Compliance Officer", authority_level: "High-Risk Approval", sla_hours: 48, can_delegate: false, status: "pending" },
        ],
        required_documents: [
          { id: "DOC-1", name: "Enhanced Due Diligence Report", type: "regulatory", status: "pending" },
          { id: "DOC-2", name: "Source of Funds Declaration", type: "kyc", status: "missing" },
          { id: "DOC-3", name: "Business Purpose Documentation", type: "other", status: "received" },
        ],
        procedure_checklist: [
          { step_number: 1, action: "Initiate enhanced due diligence", responsible: "Compliance Analyst", documentation_required: "EDD initiation form", status: "in_progress" },
          { step_number: 2, action: "Verify source of funds", responsible: "Compliance", documentation_required: "SOF declaration", status: "pending" },
          { step_number: 3, action: "Complete jurisdiction risk assessment", responsible: "Compliance", documentation_required: "Risk assessment report", status: "pending" },
          { step_number: 4, action: "Obtain Compliance Officer approval", responsible: "Compliance Officer", documentation_required: "CO sign-off", status: "pending" },
          { step_number: 5, action: "Resume payment processing", responsible: "Operations", documentation_required: "N/A", status: "blocked" },
        ],
        sod_constraints: [
          { id: "SOD-1", description: "Analyst ≠ Approving Officer", satisfied: true },
        ],
        policy_citations: [
          { id: "CIT-1", source: "AML/KYC Policy", section: "7.2", snippet: "Transactions involving high-risk jurisdictions require enhanced due diligence and Compliance Officer approval.", relevance: "primary" },
          { id: "CIT-2", source: "FATF Guidelines", section: "R.10", snippet: "Financial institutions should apply enhanced CDD measures for higher-risk categories.", relevance: "supporting" },
        ],
      };

    case "reject_sanctions":
      return {
        ...basePacket,
        decision: "REJECT_SANCTIONS",
        decision_category: "reject",
        risk_score: 95,
        risk_level: "critical",
        risk_factors: [
          { category: "sanctions", factor: "Potential SDN match", impact: "high", score_contribution: 70 },
          { category: "compliance", factor: "Sanctioned program involvement", impact: "high", score_contribution: 25 },
        ],
        confidence_score: 94,
        summary: `REJECTED - Potential sanctions match requires blocking. Payment cannot proceed.`,
        rationale: [
          `Beneficiary name matches OFAC SDN list entry with 85% confidence`,
          `Match associated with RUSSIA-EO14024 sanctions program`,
          `Regulatory requirement mandates payment blocking pending investigation`,
        ],
        sanctions_result: {
          status: "POTENTIAL_MATCH",
          confidence: 78,
          matches: [
            { list: "OFAC SDN", matched_name: "Restricted Entity Limited", match_score: 85, match_type: "fuzzy", programs: ["RUSSIA-EO14024"] },
          ],
        },
        conditions: [],
        approvals_required: [],
        required_documents: [],
        procedure_checklist: [
          { step_number: 1, action: "File sanctions alert", responsible: "Compliance", documentation_required: "Alert documentation", status: "completed" },
          { step_number: 2, action: "Notify BSA/AML Officer", responsible: "Compliance", documentation_required: "Notification record", status: "completed" },
          { step_number: 3, action: "Preserve transaction records", responsible: "Operations", documentation_required: "Record retention confirmation", status: "pending" },
          { step_number: 4, action: "Consider SAR filing", responsible: "BSA Officer", documentation_required: "SAR determination memo", status: "pending" },
        ],
        sod_constraints: [],
        policy_citations: [
          { id: "CIT-1", source: "OFAC Compliance Program", section: "4.1", snippet: "All potential SDN matches must result in immediate transaction blocking pending investigation.", relevance: "primary" },
          { id: "CIT-2", source: "31 CFR 501", section: "501.603", snippet: "US persons are prohibited from engaging in transactions with blocked persons or property.", relevance: "supporting" },
        ],
      };

    case "reject_liquidity":
      return {
        ...basePacket,
        decision: "REJECT_LIQUIDITY",
        decision_category: "reject",
        risk_score: 78,
        risk_level: "high",
        risk_factors: [
          { category: "liquidity", factor: "Insufficient funds", impact: "high", score_contribution: 60 },
          { category: "operational", factor: "Buffer breach", impact: "medium", score_contribution: 18 },
        ],
        confidence_score: 99,
        summary: `REJECTED - Insufficient liquidity. Payment would breach minimum buffer requirements.`,
        rationale: [
          `Requested amount ${payment.currency} ${payment.amount.toLocaleString()} exceeds available funds after buffer`,
          `Available balance of ${payment.currency} 5,000,000 minus buffer of ${payment.currency} 1,000,000 = ${payment.currency} 4,000,000 available`,
          `Payment would result in negative buffer position - not permitted under treasury policy`,
        ],
        liquidity_result: {
          status: "INSUFFICIENT",
          available_balance: 5000000,
          requested_amount: payment.amount,
          buffer_threshold: 1000000,
          post_transaction_balance: 5000000 - payment.amount,
          buffer_utilization_pct: 112,
        },
        conditions: [],
        approvals_required: [],
        required_documents: [],
        procedure_checklist: [
          { step_number: 1, action: "Notify requester of rejection", responsible: "Operations", documentation_required: "Rejection notification", status: "pending" },
          { step_number: 2, action: "Document liquidity position", responsible: "Treasury", documentation_required: "Liquidity report", status: "completed" },
          { step_number: 3, action: "Advise on funding options", responsible: "Treasury", documentation_required: "Funding memo", status: "pending" },
        ],
        sod_constraints: [],
        policy_citations: [
          { id: "CIT-1", source: "Treasury Operations Manual", section: "3.1", snippet: "No payment may be processed that would reduce the operating account below the minimum buffer threshold.", relevance: "primary" },
          { id: "CIT-2", source: "Liquidity Risk Policy", section: "2.2", snippet: "Buffer requirements are non-negotiable and may not be waived except by Board resolution.", relevance: "supporting" },
        ],
      };

    default:
      return {
        ...basePacket,
        decision: "HOLD_PENDING_APPROVAL",
        decision_category: "hold",
        risk_score: 50,
        risk_level: "medium",
        rationale: ["Payment requires manual review"],
        conditions: [],
        approvals_required: [],
        required_documents: [],
        procedure_checklist: [],
        sod_constraints: [],
        policy_citations: [],
      };
  }
}
