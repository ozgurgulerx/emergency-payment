"use client";

import { useState } from "react";
import { OrchestratorDecision, Evidence } from "@/store/orchestrator-store";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch,
  Lightbulb,
  AlertTriangle,
  CheckCircle,
  Target,
  ChevronDown,
  Plus,
  Minus,
  Zap,
  Settings,
  Wrench,
  Shield,
  TrendingUp,
  Database,
  Activity,
  Info,
  type LucideIcon,
} from "lucide-react";
import type { DecisionType } from "@/lib/trace-events";

interface AuditTrailProps {
  decisions: OrchestratorDecision[];
  evidence: Evidence[];
}

type FilterType = "all" | "decisions" | "evidence";

export function AuditTrail({ decisions, evidence }: AuditTrailProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Combine and sort by timestamp
  const allItems = [
    ...decisions.map((d) => ({ type: "decision" as const, data: d, timestamp: d.timestamp })),
    ...evidence.map((e) => ({ type: "evidence" as const, data: e, timestamp: e.timestamp })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredItems =
    filter === "all"
      ? allItems
      : filter === "decisions"
      ? allItems.filter((i) => i.type === "decision")
      : allItems.filter((i) => i.type === "evidence");

  return (
    <div className="bg-card border border-border/30 rounded-xl p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Audit Trail</h2>
        <div className="flex gap-1">
          {(["all", "decisions", "evidence"] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-full transition-all ${
                filter === f
                  ? "bg-amber-500 text-white"
                  : "bg-surface-1 hover:bg-surface-2"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
        <AnimatePresence>
          {filteredItems.map((item, index) => (
            <motion.div
              key={`${item.type}-${index}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="relative pl-4 border-l-2 border-border/30"
            >
              {/* Timeline dot */}
              <div
                className={`absolute -left-1.5 top-2 w-3 h-3 rounded-full ${
                  item.type === "decision" ? "bg-blue-500" : "bg-amber-500"
                }`}
              />

              {item.type === "decision" ? (
                <DecisionItem
                  decision={item.data as OrchestratorDecision}
                  isExpanded={expanded === `decision-${index}`}
                  onToggle={() =>
                    setExpanded(
                      expanded === `decision-${index}` ? null : `decision-${index}`
                    )
                  }
                />
              ) : (
                <EvidenceItem evidence={item.data as Evidence} />
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredItems.length === 0 && (
          <div className="text-center text-muted-foreground py-8 text-sm">
            No items to display
          </div>
        )}
      </div>
    </div>
  );
}

function DecisionItem({
  decision,
  isExpanded,
  onToggle,
}: {
  decision: OrchestratorDecision;
  isExpanded: boolean;
  onToggle: () => void;
}) {
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
    plan_created: "bg-purple-500/10 text-purple-400",
    include_agent: "bg-green-500/10 text-green-400",
    exclude_agent: "bg-slate-500/10 text-slate-400",
    inject_agent: "bg-amber-500/10 text-amber-400",
    remove_agent: "bg-red-500/10 text-red-400",
    select_candidate: "bg-green-500/10 text-green-400",
    switch_solver: "bg-blue-500/10 text-blue-400",
    tighten_constraints: "bg-orange-500/10 text-orange-400",
    repair_constraints: "bg-pink-500/10 text-pink-400",
    conflict_detected: "bg-amber-500/10 text-amber-400",
    conflict_resolved: "bg-emerald-500/10 text-emerald-400",
    checkpoint: "bg-gray-500/10 text-gray-400",
    commit: "bg-green-500/10 text-green-400",
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

  const Icon = typeIcons[decision.type] || GitBranch;
  const colorClass = typeColors[decision.type] || "bg-blue-500/10 text-blue-400";
  const label = typeLabels[decision.type] || decision.type.replace("_", " ");

  return (
    <div className="p-3 bg-surface-1 rounded-lg">
      <button
        onClick={onToggle}
        className="w-full text-left flex items-start justify-between"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Icon className="w-3 h-3 text-blue-500" />
            <span className="text-xs text-muted-foreground">
              {new Date(decision.timestamp).toLocaleTimeString()}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded ${colorClass}`}>
              {label}
            </span>
          </div>
          <p className="text-sm">{decision.reasoning}</p>

          {/* Show added/removed agents */}
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
        </div>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 pt-2 border-t border-border/30 space-y-2 text-xs">
              {decision.inputsConsidered.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Inputs:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {decision.inputsConsidered.map((input, i) => (
                      <span key={i} className="px-2 py-0.5 bg-surface-2 rounded">
                        {input}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-4 text-muted-foreground">
                <span>Confidence: {Math.round(decision.confidence * 100)}%</span>
                {decision.agentName && <span>Agent: {decision.agentName}</span>}
              </div>

              {/* Show constraint diff */}
              {decision.constraintDiff && decision.constraintDiff.length > 0 && (
                <div className="space-y-1">
                  <span className="text-muted-foreground">Constraint changes:</span>
                  {decision.constraintDiff.map((diff, i) => (
                    <div key={i} className="text-xs pl-2">
                      <span className="text-muted-foreground">{diff.field}: </span>
                      <span className="text-red-400">{diff.from}</span>
                      <span className="mx-1">→</span>
                      <span className="text-green-400">{diff.to}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type EvidenceType = Evidence["type"];

function EvidenceItem({ evidence }: { evidence: Evidence }) {
  const typeColors: Record<EvidenceType, string> = {
    constraint: "bg-blue-500/10 text-blue-400",
    data: "bg-gray-500/10 text-gray-400",
    insight: "bg-green-500/10 text-green-400",
    warning: "bg-amber-500/10 text-amber-400",
    filter: "bg-purple-500/10 text-purple-400",
    forecast: "bg-teal-500/10 text-teal-400",
    validation: "bg-emerald-500/10 text-emerald-400",
    stress_test: "bg-orange-500/10 text-orange-400",
    optimization: "bg-indigo-500/10 text-indigo-400",
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
  const colorClass = typeColors[evidence.type] || "bg-gray-500/10 text-gray-400";

  return (
    <div className="p-3 bg-surface-1 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-3 h-3 ${colorClass.split(" ")[1]}`} />
        <span className="text-xs text-muted-foreground">
          {new Date(evidence.timestamp).toLocaleTimeString()}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded ${colorClass}`}>
          {evidence.type.replace("_", " ")}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {evidence.agentName}
        </span>
      </div>
      <p className="text-sm">{evidence.summary}</p>
    </div>
  );
}
