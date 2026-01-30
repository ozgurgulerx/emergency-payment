// Enhanced Decision Model for Emergency Payment Runbook

// Primary decision categories
export type PrimaryDecision =
  // Release decisions
  | "RELEASE"                    // Immediate processing approved
  | "RELEASE_WITH_CONDITIONS"    // Approved with specific requirements
  | "PARTIAL_RELEASE"            // Only part of amount approved
  // Hold decisions
  | "HOLD_PENDING_APPROVAL"      // Needs specific approver(s)
  | "HOLD_PENDING_DOCUMENTATION" // Missing required documents
  | "HOLD_PENDING_VERIFICATION"  // Needs beneficiary/account verification
  | "HOLD_DUAL_CONTROL"          // Requires dual authorization
  // Defer decisions
  | "DEFER_TO_CUTOFF"            // Process at next payment window
  | "DEFER_NEXT_BUSINESS_DAY"    // Process next business day
  // Escalation decisions
  | "ESCALATE_COMPLIANCE"        // Compliance team review needed
  | "ESCALATE_MANAGEMENT"        // Senior management review
  | "ESCALATE_LEGAL"             // Legal/regulatory review
  | "ESCALATE_FRAUD_TEAM"        // Fraud investigation team
  // Rejection decisions
  | "REJECT_SANCTIONS"           // Blocked due to sanctions match
  | "REJECT_LIQUIDITY"           // Insufficient funds/buffer
  | "REJECT_POLICY"              // Policy violation
  | "REJECT_FRAUD_RISK"          // Suspected fraud indicators
  | "REJECT_INVALID_BENEFICIARY" // Beneficiary validation failed
  | "REJECT_LIMIT_EXCEEDED";     // Transaction limit exceeded

// Decision category for UI grouping
export type DecisionCategory = "release" | "hold" | "defer" | "escalate" | "reject";

// Risk levels
export type RiskLevel = "low" | "medium" | "high" | "critical";

// Sanctions screening result
export interface SanctionsResult {
  status: "CLEAR" | "POTENTIAL_MATCH" | "CONFIRMED_MATCH" | "REVIEW_REQUIRED";
  confidence: number; // 0-100
  matches: SanctionsMatch[];
  lists_checked: string[];
  screening_timestamp: string;
}

export interface SanctionsMatch {
  list: string;
  matched_name: string;
  match_score: number;
  match_type: "exact" | "fuzzy" | "alias" | "related_entity";
  sdnType?: string;
  programs?: string[];
}

// Liquidity check result
export interface LiquidityResult {
  status: "SUFFICIENT" | "MARGINAL" | "INSUFFICIENT" | "REQUIRES_FUNDING";
  available_balance: number;
  requested_amount: number;
  buffer_threshold: number;
  post_transaction_balance: number;
  buffer_utilization_pct: number;
  intraday_limit_remaining?: number;
  funding_sources?: FundingSource[];
}

export interface FundingSource {
  account: string;
  available: number;
  transfer_time_minutes: number;
}

// Procedure check result
export interface ProceduresResult {
  approval_tier: "standard" | "elevated" | "executive" | "board";
  dual_control_required: boolean;
  four_eyes_required: boolean;
  documentation_status: "complete" | "partial" | "missing";
  missing_documents: string[];
  time_constraints: TimeConstraint[];
  policy_exceptions: PolicyException[];
}

export interface TimeConstraint {
  type: "cutoff" | "sla" | "regulatory";
  deadline: string;
  description: string;
  can_extend: boolean;
}

export interface PolicyException {
  policy_id: string;
  description: string;
  requires_waiver: boolean;
  waiver_authority: string;
}

// Dynamic conditions attached to decisions
export interface DecisionCondition {
  id: string;
  type: "document" | "approval" | "verification" | "time" | "amount" | "other";
  description: string;
  required: boolean;
  satisfied: boolean;
  deadline?: string;
  responsible_party?: string;
}

// Approval chain
export interface ApprovalRequirement {
  sequence: number;
  role: string;
  authority_level: string;
  sla_hours: number;
  can_delegate: boolean;
  delegated_to?: string;
  status: "pending" | "approved" | "rejected" | "delegated";
  approved_by?: string;
  approved_at?: string;
}

// Required document
export interface RequiredDocument {
  id: string;
  name: string;
  type: "kyc" | "invoice" | "contract" | "authorization" | "regulatory" | "other";
  status: "received" | "pending" | "missing" | "expired";
  expiry_date?: string;
  uploaded_by?: string;
}

// Citation from policy/procedure
export interface PolicyCitation {
  id: string;
  source: string;
  section: string;
  snippet: string;
  relevance: "primary" | "supporting" | "related";
  url?: string;
}

// Procedure checklist item
export interface ProcedureChecklistItem {
  step_number: number;
  action: string;
  responsible: string;
  documentation_required: string;
  status: "pending" | "in_progress" | "completed" | "skipped" | "blocked";
  completed_by?: string;
  completed_at?: string;
  notes?: string;
}

// SoD constraint
export interface SoDConstraint {
  id: string;
  description: string;
  satisfied: boolean;
  conflicting_roles?: string[];
  mitigation?: string;
}

// Backend-compatible approval format
export interface BackendApproval {
  role: string;
  authority: string;
  sla_hours: number;
}

// Backend-compatible citation format
export interface BackendCitation {
  source: string;
  snippet: string;
  reference: string;
}

// Backend-compatible checklist item
export interface BackendChecklistItem {
  step_number: number;
  action: string;
  responsible: string;
  documentation_required: string;
}

// The complete decision packet (matches backend DecisionPacket schema)
export interface DecisionPacket {
  // Primary decision
  decision: PrimaryDecision;
  decision_category?: DecisionCategory;

  // Risk assessment (optional - may not always be present)
  risk_score?: number; // 0-100
  risk_level?: RiskLevel;
  risk_factors?: RiskFactor[];

  // Confidence (optional)
  confidence_score?: number; // 0-100
  confidence_factors?: string[];

  // Rationale
  rationale: string[];
  summary?: string;

  // Dynamic conditions (optional)
  conditions?: DecisionCondition[];

  // Approvals - backend uses simpler format
  approvals_required?: BackendApproval[] | ApprovalRequirement[];
  approval_deadline?: string;

  // Documents (optional)
  required_documents?: RequiredDocument[];

  // Procedure checklist - backend uses simpler format
  procedure_checklist?: BackendChecklistItem[] | ProcedureChecklistItem[];

  // Compliance - backend uses string array for sod_constraints
  sod_constraints?: string[] | SoDConstraint[];
  cutoff_actions?: string[];

  // Citations - backend uses simpler format
  citations?: BackendCitation[] | PolicyCitation[];
  policy_citations?: PolicyCitation[];

  // Amount handling (for partial releases)
  approved_amount?: number;
  held_amount?: number;
  release_tranches?: ReleaseTranche[];

  // Time constraints
  cutoff_time?: string;
  processing_deadline?: string;
  expiry_time?: string;

  // Agent results (raw from backend)
  sanctions_result?: Record<string, unknown>;
  liquidity_result?: Record<string, unknown>;
  procedures_result?: Record<string, unknown>;

  // Audit trail
  audit_note?: Record<string, unknown>;
  timestamps?: Record<string, string>;

  // Payment info
  payment?: PaymentDetails;

  // Metadata
  run_id: string;
  timestamp?: string;
  processing_time_ms?: number;
}

export interface ReleaseTranche {
  tranche_number: number;
  amount: number;
  release_date: string;
  conditions: string[];
  status: "scheduled" | "released" | "held";
}

export interface RiskFactor {
  category: "sanctions" | "liquidity" | "fraud" | "compliance" | "operational";
  factor: string;
  impact: "low" | "medium" | "high";
  score_contribution: number;
}

// Payment details from intake
export interface PaymentDetails {
  payment_id: string;
  beneficiary_name: string;
  beneficiary_account?: string;
  beneficiary_bank?: string;
  beneficiary_country?: string;
  amount: number;
  currency: string;
  purpose: string;
  reference?: string;
  urgency: "standard" | "urgent" | "critical";
  value_date?: string;
  initiator?: string;
  department?: string;
}

// SSE Event types
export interface WorkflowEvent {
  run_id: string;
  seq: number;
  type:
    | "step_started"
    | "step_completed"
    | "step_failed"
    | "agent_thinking"    // Agent reasoning/analysis
    | "agent_finding"     // Specific finding from analysis
    | "agent_detail"      // Additional context/metrics
    | "agent_message"
    | "tool_call"
    | "kb_query"
    | "branch"
    | "final"
    | "error";
  step: WorkflowStep;
  agent?: string;
  ts: string;
  elapsed_ms?: number;
  payload?: Record<string, unknown>;
}

export type WorkflowStep = "intake" | "sanctions" | "liquidity" | "procedures" | "summarize";

// UI helper functions
export function getDecisionCategory(decision: PrimaryDecision): DecisionCategory {
  if (decision.startsWith("RELEASE") || decision === "PARTIAL_RELEASE") return "release";
  if (decision.startsWith("HOLD")) return "hold";
  if (decision.startsWith("DEFER")) return "defer";
  if (decision.startsWith("ESCALATE")) return "escalate";
  return "reject";
}

export function getDecisionColor(decision: PrimaryDecision): string {
  const category = getDecisionCategory(decision);
  switch (category) {
    case "release": return "emerald";
    case "hold": return "amber";
    case "defer": return "blue";
    case "escalate": return "orange";
    case "reject": return "red";
  }
}

export function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case "low": return "emerald";
    case "medium": return "amber";
    case "high": return "orange";
    case "critical": return "red";
  }
}

export function formatDecisionLabel(decision: PrimaryDecision): string {
  return decision.replace(/_/g, " ");
}

export const DECISION_DESCRIPTIONS: Record<PrimaryDecision, string> = {
  "RELEASE": "Approved for immediate processing",
  "RELEASE_WITH_CONDITIONS": "Approved with specific requirements to fulfill",
  "PARTIAL_RELEASE": "Partial amount approved, remainder held",
  "HOLD_PENDING_APPROVAL": "Awaiting required approver authorization",
  "HOLD_PENDING_DOCUMENTATION": "Missing required supporting documents",
  "HOLD_PENDING_VERIFICATION": "Beneficiary or account verification needed",
  "HOLD_DUAL_CONTROL": "Requires second authorized user",
  "DEFER_TO_CUTOFF": "Scheduled for next payment cutoff window",
  "DEFER_NEXT_BUSINESS_DAY": "Processing deferred to next business day",
  "ESCALATE_COMPLIANCE": "Referred to compliance team for review",
  "ESCALATE_MANAGEMENT": "Requires senior management decision",
  "ESCALATE_LEGAL": "Legal or regulatory review required",
  "ESCALATE_FRAUD_TEAM": "Flagged for fraud investigation",
  "REJECT_SANCTIONS": "Blocked due to sanctions screening match",
  "REJECT_LIQUIDITY": "Insufficient funds or buffer threshold",
  "REJECT_POLICY": "Violates payment policy requirements",
  "REJECT_FRAUD_RISK": "High fraud risk indicators detected",
  "REJECT_INVALID_BENEFICIARY": "Beneficiary validation failed",
  "REJECT_LIMIT_EXCEEDED": "Exceeds authorized transaction limits",
};
