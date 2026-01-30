/**
 * Agent Registry - Defines all 17 agents with their inclusion/injection triggers.
 *
 * Categories:
 * - core: Always included in every run
 * - conditional: Included at plan compile time based on policy
 * - runtime: Injected during execution based on signals
 */

import {
  Brain,
  FileText,
  Database,
  TrendingUp,
  Shield,
  LineChart,
  Sliders,
  CheckCircle,
  AlertTriangle,
  Activity,
  Zap,
  Target,
  Scale,
  FileSearch,
  Wrench,
  Users,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";

/**
 * Policy input structure for agent trigger evaluation.
 */
export interface PolicyInput {
  riskTolerance: "conservative" | "moderate" | "aggressive" | "very_aggressive";
  maxVolatilityPct: number;
  maxDrawdownPct: number;
  timeHorizon: "<3y" | "3-7y" | "7-15y" | ">15y";
  constraints: {
    equityMinPct: number;
    equityMaxPct: number;
    fixedIncomeMinPct: number;
    fixedIncomeMaxPct: number;
    maxSinglePositionPct: number;
    minPositions: number;
  };
  preferences: {
    esgEnabled: boolean;
    themes: string[];
    exclusions: string[];
    homeBiasPct: number;
  };
  benchmark: {
    primary: string;
    targetReturnPct: number;
    rebalanceFrequency: "monthly" | "quarterly" | "semi_annual" | "annual";
  };
}

/**
 * Runtime signals for agent injection triggers.
 */
export interface RuntimeSignals {
  infeasible: boolean;
  turnoverPct: number;
  complianceFailures: number;
  stressBreaches: number;
  redTeamSeverity: "low" | "medium" | "high";
  dataQualityScore: number;
  missingDataFields: string[];
}

/**
 * Trigger result for inclusion/injection decisions.
 */
export interface TriggerResult {
  include: boolean;
  reason: string;
}

/**
 * Agent definition with metadata and trigger functions.
 */
export interface AgentDefinition {
  id: string;
  name: string;
  shortName: string;
  description: string;
  category: "core" | "conditional" | "runtime";
  icon: LucideIcon;
  color: string;
  bgColor: string;
  // Compile-time inclusion trigger (for conditional agents)
  includeTrigger?: (policy: PolicyInput) => TriggerResult;
  // Runtime injection trigger (for runtime agents)
  runtimeTrigger?: (signals: RuntimeSignals, policy: PolicyInput) => TriggerResult;
  // Execution order hint (lower = earlier)
  order: number;
}

/**
 * Complete registry of all 17 agents.
 */
export const AGENT_REGISTRY: AgentDefinition[] = [
  // ============================================
  // CORE AGENTS (Always included)
  // ============================================
  {
    id: "policy_agent",
    name: "Policy Agent",
    shortName: "Policy",
    description: "Parses and validates the investor policy statement",
    category: "core",
    icon: FileText,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    order: 1,
  },
  {
    id: "market_agent",
    name: "Market Agent",
    shortName: "Market",
    description: "Retrieves market data and builds investment universe",
    category: "core",
    icon: Database,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    order: 2,
  },
  {
    id: "data_quality_agent",
    name: "Data Quality Agent",
    shortName: "DataQA",
    description: "Validates data freshness and completeness",
    category: "core",
    icon: FileSearch,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    order: 3,
  },
  {
    id: "risk_agent",
    name: "Risk Agent",
    shortName: "Risk",
    description: "Computes VaR, volatility constraints, and risk limits",
    category: "core",
    icon: Shield,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    order: 4,
  },
  {
    id: "return_agent",
    name: "Return Agent",
    shortName: "Return",
    description: "Forecasts expected returns and evaluates themes",
    category: "core",
    icon: TrendingUp,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    order: 5,
  },
  {
    id: "optimizer_agent",
    name: "Optimizer Agent",
    shortName: "Optimizer",
    description: "Runs mean-variance portfolio optimization",
    category: "core",
    icon: Sliders,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    order: 10,
  },
  {
    id: "compliance_agent",
    name: "Compliance Agent",
    shortName: "Compliance",
    description: "Validates ESG, exclusions, and regulatory constraints",
    category: "core",
    icon: CheckCircle,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    order: 11,
  },
  {
    id: "explain_memo_agent",
    name: "Explain Memo Agent",
    shortName: "Explain",
    description: "Generates IC memo and decision explanations",
    category: "core",
    icon: ClipboardCheck,
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
    order: 20,
  },
  {
    id: "audit_provenance_agent",
    name: "Audit Provenance Agent",
    shortName: "Audit",
    description: "Maintains immutable audit log of all decisions",
    category: "core",
    icon: FileText,
    color: "text-gray-500",
    bgColor: "bg-gray-500/10",
    order: 21,
  },

  // ============================================
  // CONDITIONAL AGENTS (Compile-time inclusion)
  // ============================================
  {
    id: "scenario_stress_agent",
    name: "Scenario Stress Agent",
    shortName: "Stress",
    description: "Runs stress tests and scenario analysis",
    category: "conditional",
    icon: Activity,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    order: 12,
    includeTrigger: (policy: PolicyInput): TriggerResult => {
      if (policy.riskTolerance === "conservative") {
        return { include: true, reason: "Conservative profile requires stress testing" };
      }
      if (policy.maxDrawdownPct <= 15) {
        return { include: true, reason: `Low drawdown tolerance (${policy.maxDrawdownPct}%) requires scenario analysis` };
      }
      if (policy.timeHorizon === "<3y") {
        return { include: true, reason: "Short time horizon (<3y) requires stress validation" };
      }
      return { include: false, reason: "Not required for moderate/aggressive long-term profiles" };
    },
  },
  {
    id: "liquidity_tc_agent",
    name: "Liquidity & TC Agent",
    shortName: "Liquidity",
    description: "Evaluates transaction costs, slippage, and turnover",
    category: "conditional",
    icon: Zap,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    order: 13,
    includeTrigger: (policy: PolicyInput): TriggerResult => {
      if (policy.benchmark.rebalanceFrequency === "monthly" || policy.benchmark.rebalanceFrequency === "quarterly") {
        return { include: true, reason: `Frequent rebalancing (${policy.benchmark.rebalanceFrequency}) requires TC analysis` };
      }
      if (policy.constraints.minPositions >= 20) {
        return { include: true, reason: `High position count (${policy.constraints.minPositions}+) requires liquidity check` };
      }
      if (policy.constraints.maxSinglePositionPct <= 5) {
        return { include: true, reason: `Low concentration limit (${policy.constraints.maxSinglePositionPct}%) implies many trades` };
      }
      return { include: false, reason: "Low turnover expected, TC analysis not critical" };
    },
  },
  {
    id: "hedge_tail_agent",
    name: "Hedge Tail Agent",
    shortName: "HedgeTail",
    description: "Suggests tail-risk mitigation overlays",
    category: "conditional",
    icon: AlertTriangle,
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
    order: 14,
    includeTrigger: (policy: PolicyInput): TriggerResult => {
      if (policy.maxDrawdownPct <= 15) {
        return { include: true, reason: `Strict drawdown limit (${policy.maxDrawdownPct}%) requires tail hedging` };
      }
      if (policy.riskTolerance === "conservative") {
        return { include: true, reason: "Conservative profile benefits from tail protection" };
      }
      return { include: false, reason: "Tail hedging not required for risk-tolerant profiles" };
    },
  },
  {
    id: "challenger_optimizer_agent",
    name: "Challenger Optimizer Agent",
    shortName: "Challenger",
    description: "Runs parallel solvers (MV, CVaR, Risk Parity)",
    category: "conditional",
    icon: Users,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    order: 9,
    includeTrigger: (policy: PolicyInput): TriggerResult => {
      if (policy.riskTolerance === "aggressive" || policy.riskTolerance === "very_aggressive") {
        return { include: true, reason: `Aggressive profile benefits from solver comparison` };
      }
      if (policy.preferences.themes.length > 0) {
        return { include: true, reason: `Theme tilts (${policy.preferences.themes.join(", ")}) benefit from alternative solvers` };
      }
      if (policy.benchmark.targetReturnPct >= 10) {
        return { include: true, reason: `High return target (${policy.benchmark.targetReturnPct}%) requires solver exploration` };
      }
      return { include: false, reason: "Single optimizer sufficient for moderate profiles" };
    },
  },
  {
    id: "red_team_agent",
    name: "Red Team Agent",
    shortName: "RedTeam",
    description: "Adversarial break tests for fragility",
    category: "conditional",
    icon: Target,
    color: "text-red-600",
    bgColor: "bg-red-600/10",
    order: 15,
    includeTrigger: (policy: PolicyInput): TriggerResult => {
      if (policy.riskTolerance === "aggressive" || policy.riskTolerance === "very_aggressive") {
        return { include: true, reason: "Aggressive profile requires adversarial validation" };
      }
      return { include: false, reason: "Red team testing not required for conservative/moderate profiles" };
    },
  },
  {
    id: "rebalance_planner_agent",
    name: "Rebalance Planner Agent",
    shortName: "Rebalance",
    description: "Generates trade list with drift bands",
    category: "conditional",
    icon: Scale,
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
    order: 18,
    includeTrigger: (policy: PolicyInput): TriggerResult => {
      if (policy.benchmark.rebalanceFrequency !== "annual") {
        return { include: true, reason: `${policy.benchmark.rebalanceFrequency} rebalancing requires trade planning` };
      }
      return { include: false, reason: "Annual rebalancing does not require detailed trade planning" };
    },
  },

  // ============================================
  // RUNTIME AGENTS (Injected on signals)
  // ============================================
  {
    id: "constraint_repair_agent",
    name: "Constraint Repair Agent",
    shortName: "Repair",
    description: "Repairs infeasible constraints with diffs",
    category: "runtime",
    icon: Wrench,
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
    order: 16,
    runtimeTrigger: (signals: RuntimeSignals, _policy: PolicyInput): TriggerResult => {
      if (signals.infeasible) {
        return { include: true, reason: "Optimization infeasible - repairing constraints" };
      }
      if (signals.complianceFailures > 0) {
        return { include: true, reason: `${signals.complianceFailures} compliance violations - adjusting constraints` };
      }
      return { include: false, reason: "No constraint issues detected" };
    },
  },
];

// ============================================
// Helper functions
// ============================================

/**
 * Get an agent by ID.
 */
export function getAgent(id: string): AgentDefinition | undefined {
  return AGENT_REGISTRY.find((a) => a.id === id);
}

/**
 * Get all agents of a specific category.
 */
export function getAgentsByCategory(category: "core" | "conditional" | "runtime"): AgentDefinition[] {
  return AGENT_REGISTRY.filter((a) => a.category === category);
}

/**
 * Compile the execution plan based on policy input.
 * Returns selected agents (with reasons) and excluded agents (with reasons).
 */
export function compilePlan(policy: PolicyInput): {
  selected: Array<{ agent: AgentDefinition; reason: string }>;
  excluded: Array<{ agent: AgentDefinition; reason: string }>;
  executionOrder: AgentDefinition[];
} {
  const selected: Array<{ agent: AgentDefinition; reason: string }> = [];
  const excluded: Array<{ agent: AgentDefinition; reason: string }> = [];

  for (const agent of AGENT_REGISTRY) {
    if (agent.category === "core") {
      // Core agents are always included
      selected.push({ agent, reason: `Core agent - always required` });
    } else if (agent.category === "conditional" && agent.includeTrigger) {
      // Evaluate conditional trigger
      const result = agent.includeTrigger(policy);
      if (result.include) {
        selected.push({ agent, reason: result.reason });
      } else {
        excluded.push({ agent, reason: result.reason });
      }
    }
    // Runtime agents are not included in initial plan
  }

  // Sort by execution order
  const executionOrder = selected.map((s) => s.agent).sort((a, b) => a.order - b.order);

  return { selected, excluded, executionOrder };
}

/**
 * Check if any runtime agents should be injected.
 */
export function checkRuntimeInjections(
  signals: RuntimeSignals,
  policy: PolicyInput,
  currentAgentIds: string[]
): Array<{ agent: AgentDefinition; reason: string }> {
  const injections: Array<{ agent: AgentDefinition; reason: string }> = [];

  for (const agent of AGENT_REGISTRY) {
    if (agent.category === "runtime" && agent.runtimeTrigger) {
      // Skip if already included
      if (currentAgentIds.includes(agent.id)) continue;

      const result = agent.runtimeTrigger(signals, policy);
      if (result.include) {
        injections.push({ agent, reason: result.reason });
      }
    }
  }

  // Also check if LiquidityTCAgent or HedgeTailAgent should be injected
  // (they can be triggered at runtime too)
  const turnoverThresholds = {
    conservative: 20,
    moderate: 35,
    aggressive: 60,
    very_aggressive: 80,
  };
  const threshold = turnoverThresholds[policy.riskTolerance] || 35;

  if (signals.turnoverPct > threshold && !currentAgentIds.includes("liquidity_tc_agent")) {
    const agent = getAgent("liquidity_tc_agent");
    if (agent) {
      injections.push({
        agent,
        reason: `Turnover ${signals.turnoverPct.toFixed(1)}% exceeds ${threshold}% threshold`,
      });
    }
  }

  if (signals.stressBreaches > 0 && !currentAgentIds.includes("hedge_tail_agent")) {
    const agent = getAgent("hedge_tail_agent");
    if (agent) {
      injections.push({
        agent,
        reason: `${signals.stressBreaches} stress test breaches detected`,
      });
    }
  }

  return injections;
}

/**
 * Get the orchestrator (special agent at the center).
 */
export const ORCHESTRATOR: AgentDefinition = {
  id: "orchestrator",
  name: "Orchestrator",
  shortName: "Orch",
  description: "Central conductor that plans and delegates",
  category: "core",
  icon: Brain,
  color: "text-amber-500",
  bgColor: "bg-amber-500/10",
  order: 0,
};

/**
 * Default policy for testing.
 */
export const DEFAULT_POLICY: PolicyInput = {
  riskTolerance: "moderate",
  maxVolatilityPct: 15,
  maxDrawdownPct: 20,
  timeHorizon: "7-15y",
  constraints: {
    equityMinPct: 30,
    equityMaxPct: 70,
    fixedIncomeMinPct: 20,
    fixedIncomeMaxPct: 60,
    maxSinglePositionPct: 10,
    minPositions: 10,
  },
  preferences: {
    esgEnabled: false,
    themes: [],
    exclusions: [],
    homeBiasPct: 60,
  },
  benchmark: {
    primary: "SPY",
    targetReturnPct: 7,
    rebalanceFrequency: "quarterly",
  },
};
