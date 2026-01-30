"use client";

import { useOrchestratorStore, OrchestratorDecision, Evidence } from "@/store/orchestrator-store";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  GitBranch,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Target,
  Info,
  Plus,
  Minus,
  Zap,
  Settings,
  Wrench,
  Shield,
  TrendingUp,
  Database,
  Activity,
  type LucideIcon,
} from "lucide-react";
import type { DecisionType } from "@/lib/trace-events";

interface TimelineItemProps {
  decision: OrchestratorDecision;
}

function DecisionCard({ decision }: TimelineItemProps) {
  const [expanded, setExpanded] = useState(false);

  const typeIcons: Record<DecisionType, LucideIcon> = {
    plan_created: GitBranch,
    include_agent: Plus,
    exclude_agent: Minus,
    inject_agent: Zap,
    remove_agent: Minus,
    select_candidate: CheckCircle,
    switch_solver: Zap,
    tighten_constraints: Settings,
    repair_constraints: Wrench,
    conflict_detected: AlertTriangle,
    conflict_resolved: CheckCircle,
    checkpoint: Info,
    commit: CheckCircle,
  };

  const typeColors: Record<DecisionType, string> = {
    plan_created: "border-purple-500/30 bg-purple-500/5",
    include_agent: "border-green-500/30 bg-green-500/5",
    exclude_agent: "border-slate-500/30 bg-slate-500/5",
    inject_agent: "border-amber-500/30 bg-amber-500/5",
    remove_agent: "border-red-500/30 bg-red-500/5",
    select_candidate: "border-green-500/30 bg-green-500/5",
    switch_solver: "border-blue-500/30 bg-blue-500/5",
    tighten_constraints: "border-orange-500/30 bg-orange-500/5",
    repair_constraints: "border-pink-500/30 bg-pink-500/5",
    conflict_detected: "border-amber-500/30 bg-amber-500/5",
    conflict_resolved: "border-emerald-500/30 bg-emerald-500/5",
    checkpoint: "border-gray-500/30 bg-gray-500/5",
    commit: "border-green-500/30 bg-green-500/5",
  };

  const typeLabels: Record<DecisionType, string> = {
    plan_created: "Plan Created",
    include_agent: "Agent Included",
    exclude_agent: "Agent Excluded",
    inject_agent: "Agent Injected",
    remove_agent: "Agent Removed",
    select_candidate: "Candidate Selected",
    switch_solver: "Solver Switch",
    tighten_constraints: "Constraints Tightened",
    repair_constraints: "Constraints Repaired",
    conflict_detected: "Conflict Detected",
    conflict_resolved: "Conflict Resolved",
    checkpoint: "Checkpoint",
    commit: "Committed",
  };

  const Icon = typeIcons[decision.type] || Info;
  const colorClass = typeColors[decision.type] || "border-gray-500/30 bg-gray-500/5";
  const label = typeLabels[decision.type] || decision.type;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-lg border p-3 ${colorClass}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          <Icon className="w-4 h-4 mt-0.5 text-muted-foreground" />
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              {new Date(decision.timestamp).toLocaleTimeString()}
              <span className="ml-2 px-1.5 py-0.5 rounded bg-surface-2 text-xs">{label}</span>
              {decision.agentName && (
                <span className="ml-2 text-amber-500">{decision.agentName}</span>
              )}
            </div>
            <p className="text-sm">{decision.reasoning}</p>

            {/* Show added/removed agents for inject/remove decisions */}
            {decision.addedAgents && decision.addedAgents.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {decision.addedAgents.map((a) => (
                  <span key={a.id} className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                    + {a.name}
                  </span>
                ))}
              </div>
            )}

            {decision.removedAgents && decision.removedAgents.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {decision.removedAgents.map((a) => (
                  <span key={a.id} className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                    - {a.name}
                  </span>
                ))}
              </div>
            )}

            {/* Show solver switch */}
            {decision.solverSwitch && (
              <div className="mt-2 text-xs">
                <span className="text-muted-foreground">Solver: </span>
                <span className="text-red-400">{decision.solverSwitch.from}</span>
                <span className="mx-1">→</span>
                <span className="text-green-400">{decision.solverSwitch.to}</span>
              </div>
            )}

            {/* Show constraint diff */}
            {decision.constraintDiff && decision.constraintDiff.length > 0 && (
              <div className="mt-2 space-y-1">
                {decision.constraintDiff.map((diff, i) => (
                  <div key={i} className="text-xs">
                    <span className="text-muted-foreground">{diff.field}: </span>
                    <span className="text-red-400">{diff.from}</span>
                    <span className="mx-1">→</span>
                    <span className="text-green-400">{diff.to}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 hover:bg-surface-2 rounded"
        >
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
              {decision.inputsConsidered.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">
                    Inputs considered:
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {decision.inputsConsidered.map((input, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-0.5 rounded-full bg-surface-2"
                      >
                        {input}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 text-xs">
                <span className="text-muted-foreground">
                  Confidence: {Math.round(decision.confidence * 100)}%
                </span>
                {decision.alternatives && decision.alternatives.length > 0 && (
                  <span className="text-muted-foreground">
                    Alternatives: {decision.alternatives.join(", ")}
                  </span>
                )}
              </div>

              {/* Show affected candidates */}
              {decision.affectedCandidateIds && decision.affectedCandidateIds.length > 0 && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Affected candidates: </span>
                  {decision.affectedCandidateIds.join(", ")}
                </div>
              )}

              {decision.selectedCandidateId && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Selected: </span>
                  <span className="text-green-400">{decision.selectedCandidateId}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

type EvidenceType = Evidence["type"];

function EvidenceChip({ evidence }: { evidence: Evidence }) {
  const typeColors: Record<EvidenceType, string> = {
    constraint: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    data: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    insight: "bg-green-500/10 text-green-400 border-green-500/20",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    filter: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    forecast: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    validation: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    stress_test: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    optimization: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  };

  const typeIcons: Record<EvidenceType, LucideIcon> = {
    constraint: Target,
    data: Database,
    insight: Lightbulb,
    warning: AlertTriangle,
    filter: Shield,
    forecast: TrendingUp,
    validation: CheckCircle,
    stress_test: Activity,
    optimization: Settings,
  };

  const Icon = typeIcons[evidence.type] || Info;
  const colorClass = typeColors[evidence.type] || "bg-gray-500/10 text-gray-400 border-gray-500/20";

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs ${colorClass}`}
    >
      <Icon className="w-3 h-3" />
      <span className="max-w-[200px] truncate">{evidence.summary}</span>
    </motion.div>
  );
}

export function OrchestratorTimeline() {
  const decisions = useOrchestratorStore((state) => state.decisions);
  const evidence = useOrchestratorStore((state) => state.evidence);
  const statusMessage = useOrchestratorStore((state) => state.statusMessage);
  const status = useOrchestratorStore((state) => state.status);
  const plan = useOrchestratorStore((state) => state.plan);

  return (
    <div className="h-full flex flex-col">
      {/* Status Banner */}
      <div
        className={`p-3 rounded-lg mb-4 ${
          status === "running"
            ? "bg-amber-500/10 border border-amber-500/20"
            : status === "completed"
            ? "bg-green-500/10 border border-green-500/20"
            : status === "failed"
            ? "bg-red-500/10 border border-red-500/20"
            : "bg-surface-2 border border-border/30"
        }`}
      >
        <div className="flex items-center gap-2">
          {status === "running" && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
          )}
          <span className="text-sm font-medium">
            {status === "running" ? "LIVE" : status.toUpperCase()}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{statusMessage}</p>
      </div>

      {/* Plan Summary (if available) */}
      {plan.selectedAgents.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-surface-2 border border-border/30">
          <div className="text-xs text-muted-foreground mb-2">Execution Plan:</div>
          <div className="flex flex-wrap gap-1">
            {plan.selectedAgents.slice(0, 6).map((a) => (
              <span
                key={a.id}
                className={`text-xs px-2 py-0.5 rounded-full ${
                  a.category === "core"
                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                }`}
                title={a.reason}
              >
                {a.name}
              </span>
            ))}
            {plan.selectedAgents.length > 6 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-muted-foreground">
                +{plan.selectedAgents.length - 6} more
              </span>
            )}
          </div>
          {plan.runtimeInjections.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-amber-400 mb-1">Runtime injected:</div>
              <div className="flex flex-wrap gap-1">
                {plan.runtimeInjections.map((a) => (
                  <span
                    key={a.id}
                    className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    title={a.reason}
                  >
                    + {a.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evidence Chips */}
      {evidence.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-muted-foreground mb-2">Evidence collected:</div>
          <div className="flex flex-wrap gap-2">
            {evidence.slice(-6).map((ev) => (
              <EvidenceChip key={ev.id} evidence={ev} />
            ))}
          </div>
        </div>
      )}

      {/* Decisions Timeline */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-2">
        <AnimatePresence>
          {decisions
            .slice()
            .reverse()
            .map((decision) => (
              <DecisionCard key={decision.id} decision={decision} />
            ))}
        </AnimatePresence>

        {decisions.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8">
            Waiting for orchestrator decisions...
          </div>
        )}
      </div>
    </div>
  );
}
