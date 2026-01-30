import { create } from "zustand";
import type {
  TraceEvent,
  PlanEventData,
  DecisionEventData,
  HandoverEventData,
  BranchEventData,
  CandidateEventData,
  GateEventData,
  RepairEventData,
  EvidenceEventData,
  PortfolioUpdateEventData,
  CandidateStatus,
  DecisionType,
  GateType,
} from "@/lib/trace-events";
import { getAgent, AGENT_REGISTRY, ORCHESTRATOR } from "@/lib/agent-registry";

export type AgentStatus = "idle" | "queued" | "running" | "waiting" | "blocked" | "completed" | "failed";

export interface Agent {
  id: string;
  name: string;
  shortName: string;
  status: AgentStatus;
  currentObjective?: string;
  progress: number;
  lastUpdate?: string;
  category?: "core" | "conditional" | "runtime";
  color?: string;
  bgColor?: string;
}

export interface Evidence {
  id: string;
  agentId: string;
  agentName: string;
  type: "constraint" | "data" | "insight" | "warning" | "filter" | "forecast" | "validation" | "stress_test" | "optimization";
  summary: string;
  confidence: number;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface OrchestratorDecision {
  id: string;
  timestamp: string;
  type: DecisionType;
  reasoning: string;
  inputsConsidered: string[];
  ruleApplied?: string;
  confidence: number;
  alternatives: string[];
  agentId?: string;
  agentName?: string;
  // Enhanced fields
  addedAgents?: Array<{ id: string; name: string; reason: string }>;
  removedAgents?: Array<{ id: string; name: string; reason: string }>;
  affectedCandidateIds?: string[];
  selectedCandidateId?: string;
  constraintDiff?: Array<{ field: string; from: string | number; to: string | number; reason: string }>;
  solverSwitch?: { from: string; to: string; reason: string };
}

export interface Conflict {
  id: string;
  agents: string[];
  issue: string;
  resolved: boolean;
  resolution?: string;
}

export interface PortfolioAllocation {
  allocations: Record<string, number>;
  metrics: {
    expectedReturn?: number;
    volatility?: number;
    sharpe?: number;
    var95?: number;
  };
  lastUpdated?: string;
  explanation?: string;
}

// NEW: Plan tracking
export interface ExecutionPlan {
  selectedAgents: Array<{ id: string; name: string; reason: string; category: "core" | "conditional" }>;
  excludedAgents: Array<{ id: string; name: string; reason: string }>;
  runtimeInjections: Array<{ id: string; name: string; reason: string; ts: string }>;
  policySummary?: {
    riskTolerance: string;
    maxVolatility: number;
    maxDrawdown: number;
    esgEnabled: boolean;
    themes: string[];
    targetReturn: number;
  };
}

// NEW: Candidate tracking
export interface Candidate {
  id: string;
  solver: string;
  status: CandidateStatus;
  allocations?: Record<string, number>;
  metrics?: {
    expectedReturn?: number;
    volatility?: number;
    sharpe?: number;
    var95?: number;
    turnover?: number;
  };
  gates: {
    compliance?: { passed: boolean; issues?: string[] };
    stress?: { passed: boolean; breaches?: number; scenarios?: Array<{ name: string; impact: number; passed: boolean }> };
    redteam?: { passed: boolean; severity?: string; vulnerabilities?: string[] };
    liquidity?: { passed: boolean; turnover?: number; threshold?: number; slippage?: number };
  };
  rank?: number;
  selectionReason?: string;
}

// NEW: Span tracking for graph
export interface Span {
  spanId: string;
  parentSpanId?: string;
  agent: string;
  agentName: string;
  status: "running" | "completed" | "failed";
  startTs: string;
  endTs?: string;
}

// NEW: Handover tracking for edges
export interface Handover {
  from: string;
  to: string;
  reason: string;
  ts: string;
  candidateId?: string;
}

// NEW: Branch tracking for parallel execution
export interface Branch {
  id: string;
  type: "fork" | "join";
  branches: string[];
  reason?: string;
  ts: string;
}

// NEW: Repair loop tracking
export interface RepairLoop {
  id: string;
  candidateId: string;
  type: "constraint" | "allocation" | "solver";
  iteration: number;
  maxIterations: number;
  changes: Array<{ field: string; from: string | number; to: string | number; reason: string }>;
  status: "running" | "completed" | "failed";
  startTs: string;
  endTs?: string;
}

interface OrchestratorState {
  // Run state
  runId: string | null;
  status: "idle" | "running" | "completed" | "failed";
  progress: number;

  // Agents
  agents: Record<string, Agent>;

  // Evidence and decisions
  evidence: Evidence[];
  decisions: OrchestratorDecision[];
  conflicts: Conflict[];

  // Portfolio
  portfolio: PortfolioAllocation;

  // Status banner
  statusMessage: string;
  statusDetail?: string;

  // NEW: Plan tracking
  plan: ExecutionPlan;

  // NEW: Candidate tracking
  candidates: Record<string, Candidate>;

  // NEW: Span tracking for graph
  spans: Record<string, Span>;

  // NEW: Handover tracking for edges
  handovers: Handover[];

  // NEW: Branch tracking for parallel execution
  branches: Branch[];

  // NEW: Repair loops
  repairs: RepairLoop[];

  // Actions
  setRunId: (runId: string) => void;
  setStatus: (status: OrchestratorState["status"]) => void;
  updateAgent: (agentId: string, updates: Partial<Agent>) => void;
  addEvidence: (evidence: Evidence) => void;
  addDecision: (decision: OrchestratorDecision) => void;
  addConflict: (conflict: Conflict) => void;
  resolveConflict: (conflictId: string, resolution: string) => void;
  updatePortfolio: (portfolio: Partial<PortfolioAllocation>) => void;
  setStatusMessage: (message: string, detail?: string) => void;
  processEvent: (event: SSEEvent) => void;
  reset: () => void;
}

export interface SSEEvent {
  run_id: string;
  kind: string;
  message: string;
  payload: Record<string, unknown>;
  ts?: string;
}

// Initialize agents from registry
function buildInitialAgents(): Record<string, Agent> {
  const agents: Record<string, Agent> = {};

  // Add orchestrator
  agents[ORCHESTRATOR.id] = {
    id: ORCHESTRATOR.id,
    name: ORCHESTRATOR.name,
    shortName: ORCHESTRATOR.shortName,
    status: "idle",
    progress: 0,
    category: ORCHESTRATOR.category,
    color: ORCHESTRATOR.color,
    bgColor: ORCHESTRATOR.bgColor,
  };

  // Add all agents from registry
  for (const agentDef of AGENT_REGISTRY) {
    agents[agentDef.id] = {
      id: agentDef.id,
      name: agentDef.name,
      shortName: agentDef.shortName,
      status: "idle",
      progress: 0,
      category: agentDef.category,
      color: agentDef.color,
      bgColor: agentDef.bgColor,
    };
  }

  return agents;
}

const initialAgents = buildInitialAgents();

const initialPlan: ExecutionPlan = {
  selectedAgents: [],
  excludedAgents: [],
  runtimeInjections: [],
};

export const useOrchestratorStore = create<OrchestratorState>((set, get) => ({
  runId: null,
  status: "idle",
  progress: 0,
  agents: { ...initialAgents },
  evidence: [],
  decisions: [],
  conflicts: [],
  portfolio: { allocations: {}, metrics: {} },
  statusMessage: "Ready to start",
  plan: { ...initialPlan },
  candidates: {},
  spans: {},
  handovers: [],
  branches: [],
  repairs: [],

  setRunId: (runId) => set({ runId }),

  setStatus: (status) => set({ status }),

  updateAgent: (agentId, updates) =>
    set((state) => {
      // If agent doesn't exist in state but exists in registry, add it
      const existingAgent = state.agents[agentId];
      const registryAgent = getAgent(agentId);

      if (!existingAgent && registryAgent) {
        return {
          agents: {
            ...state.agents,
            [agentId]: {
              id: agentId,
              name: registryAgent.name,
              shortName: registryAgent.shortName,
              status: "idle",
              progress: 0,
              category: registryAgent.category,
              color: registryAgent.color,
              bgColor: registryAgent.bgColor,
              ...updates,
              lastUpdate: new Date().toISOString(),
            },
          },
        };
      }

      return {
        agents: {
          ...state.agents,
          [agentId]: { ...existingAgent, ...updates, lastUpdate: new Date().toISOString() },
        },
      };
    }),

  addEvidence: (evidence) =>
    set((state) => ({
      evidence: [...state.evidence, evidence],
    })),

  addDecision: (decision) =>
    set((state) => ({
      decisions: [...state.decisions, decision],
    })),

  addConflict: (conflict) =>
    set((state) => ({
      conflicts: [...state.conflicts, conflict],
    })),

  resolveConflict: (conflictId, resolution) =>
    set((state) => ({
      conflicts: state.conflicts.map((c) =>
        c.id === conflictId ? { ...c, resolved: true, resolution } : c
      ),
    })),

  updatePortfolio: (updates) =>
    set((state) => ({
      portfolio: {
        ...state.portfolio,
        ...updates,
        lastUpdated: new Date().toISOString(),
      },
    })),

  setStatusMessage: (message, detail) =>
    set({ statusMessage: message, statusDetail: detail }),

  processEvent: (event) => {
    const { kind, message, payload } = event;
    const state = get();

    // ══════════════════════════════════════════════════════════════════
    // SSE EVENT LOGGING
    // ══════════════════════════════════════════════════════════════════
    const timestamp = event.ts || new Date().toISOString();
    const shortTs = timestamp.split("T")[1]?.slice(0, 12) || timestamp;

    // Color codes for different event types
    const eventColors: Record<string, string> = {
      "run.started": "color: #22c55e; font-weight: bold",
      "run.completed": "color: #22c55e; font-weight: bold",
      "run.failed": "color: #ef4444; font-weight: bold",
      "orchestrator.plan": "color: #f59e0b; font-weight: bold",
      "orchestrator.decision": "color: #f59e0b",
      "span.started": "color: #3b82f6",
      "span.ended": "color: #3b82f6",
      "handover": "color: #8b5cf6",
      "branch.fork": "color: #ec4899",
      "branch.join": "color: #ec4899",
      "candidate.created": "color: #06b6d4",
      "candidate.updated": "color: #06b6d4",
      "gate.compliance": "color: #10b981",
      "gate.stress": "color: #10b981",
      "gate.redteam": "color: #10b981",
      "gate.liquidity": "color: #10b981",
      "agent.evidence": "color: #6366f1",
      "portfolio.update": "color: #14b8a6",
      "repair.started": "color: #f472b6",
      "repair.ended": "color: #f472b6",
    };

    const style = eventColors[kind] || "color: #9ca3af";
    const agentId = payload?.agentId || payload?.agent_id || payload?.actorName || "";

    // Enhanced logging for orchestrator decisions
    if (kind === "orchestrator.decision") {
      const decisionData = payload as unknown as DecisionEventData;
      const decisionType = decisionData?.decisionType || "unknown";
      const decisionColors: Record<string, string> = {
        include_agent: "color: #22c55e; font-weight: bold", // green for include
        exclude_agent: "color: #64748b", // gray for exclude
        inject_agent: "color: #f59e0b; font-weight: bold", // amber for runtime inject
        select_candidate: "color: #22c55e; font-weight: bold",
      };
      const decisionStyle = decisionColors[decisionType] || style;
      console.log(
        `%c[${shortTs}] ${kind} (${decisionType})%c ${message}`,
        decisionStyle,
        "color: inherit"
      );
      console.log("  └─ reason:", decisionData?.reason);
      if (decisionData?.addedAgents?.length) {
        console.log("  └─ added:", decisionData.addedAgents.map(a => a.name).join(", "));
      }
      if (decisionData?.removedAgents?.length) {
        console.log("  └─ excluded:", decisionData.removedAgents.map(a => a.name).join(", "));
      }
      if (decisionData?.inputsConsidered?.length) {
        console.log("  └─ inputs:", decisionData.inputsConsidered.slice(0, 4).join(", "));
      }
    } else {
      console.log(
        `%c[${shortTs}] ${kind}%c ${agentId ? `(${agentId})` : ""} ${message}`,
        style,
        "color: inherit"
      );

      // Log payload details for important events
      if (["orchestrator.plan", "candidate.created", "handover", "branch.fork", "branch.join"].includes(kind)) {
        console.log("  └─ payload:", payload);
      }
    }

    switch (kind) {
      // ============================================
      // RUN LIFECYCLE
      // ============================================
      case "run.started":
      case "run_started":
        set({
          status: "running",
          statusMessage: message,
          agents: Object.fromEntries(
            Object.entries(state.agents).map(([id, agent]) => [
              id,
              { ...agent, status: id === "orchestrator" ? "running" : "idle" },
            ])
          ),
        });
        state.updateAgent("orchestrator", { status: "running", currentObjective: "Planning workflow" });
        break;

      case "run.completed":
      case "run_completed": {
        // Get all agent IDs that were in the plan (selected + injected)
        const plannedAgentIds = new Set([
          ...state.plan.selectedAgents.map(a => a.id),
          ...state.plan.runtimeInjections.map(a => a.id),
        ]);

        set({
          status: "completed",
          statusMessage: message,
          agents: Object.fromEntries(
            Object.entries(state.agents).map(([id, agent]) => {
              // Mark as completed if:
              // 1. Currently running (existing behavior)
              // 2. Was in the plan and is still queued (never got span events)
              // 3. Orchestrator itself
              const shouldComplete =
                agent.status === "running" ||
                agent.status === "waiting" ||
                (agent.status === "queued" && plannedAgentIds.has(id)) ||
                id === "orchestrator";

              return [
                id,
                shouldComplete ? { ...agent, status: "completed", progress: 100 } : agent,
              ];
            })
          ),
        });
        break;
      }

      case "run.failed":
      case "run_failed":
        set({
          status: "failed",
          statusMessage: message,
        });
        break;

      // ============================================
      // ORCHESTRATOR PLAN
      // ============================================
      case "orchestrator.plan": {
        const planData = payload as unknown as PlanEventData;
        set({
          plan: {
            selectedAgents: planData.selectedAgents.map((a) => ({
              id: a.id,
              name: a.name,
              reason: a.reason,
              category: a.category,
            })),
            excludedAgents: planData.excludedAgents.map((a) => ({
              id: a.id,
              name: a.name,
              reason: a.reason,
            })),
            runtimeInjections: [],
            policySummary: planData.policySummary,
          },
          statusMessage: message,
        });

        // Mark selected agents as queued
        for (const agent of planData.selectedAgents) {
          state.updateAgent(agent.id, { status: "queued" });
        }
        break;
      }

      // ============================================
      // ORCHESTRATOR DECISION
      // ============================================
      case "orchestrator.decision": {
        const decisionData = payload as unknown as DecisionEventData;
        state.addDecision({
          id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: event.ts || new Date().toISOString(),
          type: decisionData.decisionType,
          reasoning: decisionData.reason,
          inputsConsidered: decisionData.inputsConsidered || [],
          confidence: decisionData.confidence,
          alternatives: decisionData.alternatives || [],
          addedAgents: decisionData.addedAgents,
          removedAgents: decisionData.removedAgents,
          affectedCandidateIds: decisionData.affectedCandidateIds,
          selectedCandidateId: decisionData.selectedCandidateId,
          constraintDiff: decisionData.constraintDiff,
          solverSwitch: decisionData.solverSwitch,
        });

        // Handle inject_agent decisions
        if (decisionData.decisionType === "inject_agent" && decisionData.addedAgents) {
          set((s) => ({
            plan: {
              ...s.plan,
              runtimeInjections: [
                ...s.plan.runtimeInjections,
                ...decisionData.addedAgents!.map((a) => ({
                  id: a.id,
                  name: a.name,
                  reason: a.reason,
                  ts: event.ts || new Date().toISOString(),
                })),
              ],
            },
          }));
          for (const agent of decisionData.addedAgents) {
            state.updateAgent(agent.id, { status: "queued" });
          }
        }

        set({ statusMessage: message });
        break;
      }

      // ============================================
      // SPAN LIFECYCLE
      // ============================================
      case "span.started": {
        const spanId = payload.spanId as string || `span-${Date.now()}`;
        const agentId = payload.agentId as string || payload.agent_id as string;
        const agentName = payload.agentName as string || payload.agent_name as string;

        set((s) => ({
          spans: {
            ...s.spans,
            [spanId]: {
              spanId,
              parentSpanId: payload.parentSpanId as string,
              agent: agentId,
              agentName: agentName,
              status: "running",
              startTs: event.ts || new Date().toISOString(),
            },
          },
        }));

        state.updateAgent(agentId, {
          status: "running",
          currentObjective: payload.objective as string || message,
        });
        set({ statusMessage: message });
        break;
      }

      case "span.ended": {
        const spanId = payload.spanId as string;
        const agentId = payload.agentId as string || payload.agent_id as string;
        const success = payload.success !== false;

        set((s) => ({
          spans: {
            ...s.spans,
            [spanId]: {
              ...s.spans[spanId],
              status: success ? "completed" : "failed",
              endTs: event.ts || new Date().toISOString(),
            },
          },
        }));

        state.updateAgent(agentId, {
          status: success ? "completed" : "failed",
          progress: 100,
        });
        set({ statusMessage: message });
        break;
      }

      // ============================================
      // HANDOVER
      // ============================================
      case "handover": {
        const handoverData = payload as unknown as HandoverEventData;
        set((s) => ({
          handovers: [
            ...s.handovers,
            {
              from: handoverData.fromAgent,
              to: handoverData.toAgent,
              reason: handoverData.reason,
              ts: event.ts || new Date().toISOString(),
              candidateId: handoverData.candidateId,
            },
          ],
        }));

        // Update agent statuses
        state.updateAgent(handoverData.fromAgent, { status: "waiting" });
        state.updateAgent(handoverData.toAgent, { status: "running" });
        set({ statusMessage: message });
        break;
      }

      // ============================================
      // BRANCH FORK/JOIN
      // ============================================
      case "branch.fork": {
        const branchData = payload as unknown as BranchEventData;
        set((s) => ({
          branches: [
            ...s.branches,
            {
              id: `branch-${Date.now()}`,
              type: "fork",
              branches: branchData.branches,
              reason: branchData.reason,
              ts: event.ts || new Date().toISOString(),
            },
          ],
        }));

        // Mark forked agents as running
        for (const agentId of branchData.branches) {
          state.updateAgent(agentId, { status: "running" });
        }
        set({ statusMessage: message });
        break;
      }

      case "branch.join": {
        const branchData = payload as unknown as BranchEventData;
        set((s) => ({
          branches: [
            ...s.branches,
            {
              id: `branch-${Date.now()}`,
              type: "join",
              branches: branchData.branches,
              reason: branchData.reason,
              ts: event.ts || new Date().toISOString(),
            },
          ],
        }));
        set({ statusMessage: message });
        break;
      }

      // ============================================
      // CANDIDATE LIFECYCLE
      // ============================================
      case "candidate.created": {
        const candidateData = payload as unknown as CandidateEventData;
        set((s) => ({
          candidates: {
            ...s.candidates,
            [candidateData.candidateId]: {
              id: candidateData.candidateId,
              solver: candidateData.solver,
              status: candidateData.status,
              allocations: candidateData.allocations,
              metrics: candidateData.metrics,
              gates: candidateData.gates || {},
              rank: candidateData.rank,
            },
          },
        }));
        set({ statusMessage: message });
        break;
      }

      case "candidate.updated": {
        const candidateData = payload as unknown as CandidateEventData;
        set((s) => ({
          candidates: {
            ...s.candidates,
            [candidateData.candidateId]: {
              ...s.candidates[candidateData.candidateId],
              status: candidateData.status,
              allocations: candidateData.allocations || s.candidates[candidateData.candidateId]?.allocations,
              metrics: candidateData.metrics || s.candidates[candidateData.candidateId]?.metrics,
              gates: candidateData.gates || s.candidates[candidateData.candidateId]?.gates || {},
              rank: candidateData.rank,
              selectionReason: candidateData.selectionReason,
            },
          },
        }));
        set({ statusMessage: message });
        break;
      }

      // ============================================
      // GATE VALIDATIONS
      // ============================================
      case "gate.compliance":
      case "gate.stress":
      case "gate.redteam":
      case "gate.liquidity": {
        const gateData = payload as unknown as GateEventData;
        const gateType = gateData.gateType;

        set((s) => {
          const candidate = s.candidates[gateData.candidateId];
          if (!candidate) return s;

          const gateResult = {
            passed: gateData.passed,
            ...(gateData.details.violations && { issues: gateData.details.violations }),
            ...(gateData.details.breaches !== undefined && { breaches: gateData.details.breaches }),
            ...(gateData.details.scenarios && { scenarios: gateData.details.scenarios }),
            ...(gateData.details.severity && { severity: gateData.details.severity }),
            ...(gateData.details.vulnerabilities && { vulnerabilities: gateData.details.vulnerabilities }),
            ...(gateData.details.turnover !== undefined && { turnover: gateData.details.turnover }),
            ...(gateData.details.threshold !== undefined && { threshold: gateData.details.threshold }),
            ...(gateData.details.slippage !== undefined && { slippage: gateData.details.slippage }),
          };

          return {
            candidates: {
              ...s.candidates,
              [gateData.candidateId]: {
                ...candidate,
                gates: {
                  ...candidate.gates,
                  [gateType]: gateResult,
                },
              },
            },
          };
        });
        set({ statusMessage: message });
        break;
      }

      // ============================================
      // REPAIR LOOPS
      // ============================================
      case "repair.started": {
        const repairData = payload as unknown as RepairEventData;
        set((s) => ({
          repairs: [
            ...s.repairs,
            {
              id: `repair-${Date.now()}`,
              candidateId: repairData.candidateId,
              type: repairData.repairType,
              iteration: repairData.iteration,
              maxIterations: repairData.maxIterations,
              changes: repairData.changes,
              status: "running",
              startTs: event.ts || new Date().toISOString(),
            },
          ],
        }));
        set({ statusMessage: message });
        break;
      }

      case "repair.ended": {
        const repairData = payload as unknown as RepairEventData;
        set((s) => ({
          repairs: s.repairs.map((r) =>
            r.candidateId === repairData.candidateId && r.status === "running"
              ? {
                  ...r,
                  status: repairData.success ? "completed" : "failed",
                  endTs: event.ts || new Date().toISOString(),
                }
              : r
          ),
        }));
        set({ statusMessage: message });
        break;
      }

      // ============================================
      // AGENT EVIDENCE & REASONING
      // ============================================
      case "agent.evidence": {
        const evidenceData = payload as unknown as EvidenceEventData;
        state.addEvidence({
          id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          agentId: evidenceData.agentId,
          agentName: evidenceData.agentName,
          type: evidenceData.evidenceType,
          summary: evidenceData.summary,
          confidence: evidenceData.confidence,
          timestamp: event.ts || new Date().toISOString(),
          details: evidenceData.details,
        });
        break;
      }

      case "agent.reasoning": {
        // Similar to evidence but for reasoning trace
        const reasoning = payload as { agentId: string; agentName: string; reasoning: string; confidence?: number };
        state.addEvidence({
          id: `reason-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          agentId: reasoning.agentId,
          agentName: reasoning.agentName,
          type: "insight",
          summary: reasoning.reasoning,
          confidence: reasoning.confidence || 0.9,
          timestamp: event.ts || new Date().toISOString(),
        });
        break;
      }

      // ============================================
      // PORTFOLIO UPDATE
      // ============================================
      case "portfolio.update": {
        const portfolioData = payload as unknown as PortfolioUpdateEventData;
        state.updatePortfolio({
          allocations: portfolioData.allocations,
          metrics: portfolioData.metrics,
        });

        // If this is the final portfolio (not intermediate), update candidate status
        if (!portfolioData.isIntermediate && portfolioData.candidateId) {
          set((s) => ({
            candidates: {
              ...s.candidates,
              [portfolioData.candidateId!]: {
                ...s.candidates[portfolioData.candidateId!],
                status: "selected",
                allocations: portfolioData.allocations,
                metrics: portfolioData.metrics,
              },
            },
          }));
        }
        set({ statusMessage: message || "Portfolio updated" });
        break;
      }

      // ============================================
      // PORTFOLIO EXPLANATION
      // ============================================
      case "portfolio.explanation": {
        const explanation = payload.explanation as string;
        state.updatePortfolio({ explanation });
        set({ statusMessage: "Portfolio explanation generated" });
        break;
      }

      // ============================================
      // LEGACY EVENTS (backward compatibility)
      // ============================================
      case "orchestrator.delegated": {
        const delegatedAgentId = payload.agent_id as string;
        state.updateAgent(delegatedAgentId, {
          status: "running",
          currentObjective: payload.task_type as string,
        });
        state.addDecision({
          id: payload.decision_id as string || `dec-${Date.now()}`,
          timestamp: event.ts || new Date().toISOString(),
          type: "plan_created",
          reasoning: payload.reasoning as string || message,
          inputsConsidered: payload.inputs_considered as string[] || [],
          confidence: payload.confidence as number || 0.9,
          alternatives: payload.alternatives as string[] || [],
          agentId: delegatedAgentId,
          agentName: state.agents[delegatedAgentId]?.name,
        });
        set({ statusMessage: message });
        break;
      }

      case "agent.status": {
        const agentId = payload.agent_id as string;
        const agentStatus = payload.status as AgentStatus;
        state.updateAgent(agentId, {
          status: agentStatus,
          currentObjective: payload.current_objective as string,
          progress: payload.progress as number || 0,
        });
        break;
      }

      case "orchestrator.conflict": {
        state.addConflict({
          id: payload.conflict_id as string || `conf-${Date.now()}`,
          agents: payload.agents as string[] || [],
          issue: payload.issue as string || message,
          resolved: false,
        });
        set({ statusMessage: `Conflict: ${message}` });
        break;
      }

      case "orchestrator.resolved": {
        state.resolveConflict(
          payload.conflict_id as string,
          payload.resolution as string || message
        );
        set({ statusMessage: `Resolved: ${message}` });
        break;
      }

      default:
        // Handle stage events for backward compatibility
        if (kind.startsWith("stage_")) {
          set({ statusMessage: message });
        }
    }
  },

  reset: () =>
    set({
      runId: null,
      status: "idle",
      progress: 0,
      agents: { ...initialAgents },
      evidence: [],
      decisions: [],
      conflicts: [],
      portfolio: { allocations: {}, metrics: {} },
      statusMessage: "Ready to start",
      statusDetail: undefined,
      plan: { ...initialPlan },
      candidates: {},
      spans: {},
      handovers: [],
      branches: [],
      repairs: [],
    }),
}));
