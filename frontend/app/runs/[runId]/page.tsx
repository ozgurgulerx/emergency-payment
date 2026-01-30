"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Shield,
  Banknote,
  FileCheck,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Building2,
  User,
  DollarSign,
  FileText,
  Download,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Gauge,
  Scale,
  Pause,
  ArrowUpRight,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  type PrimaryDecision,
  type DecisionPacket,
  type PaymentDetails,
  type WorkflowStep,
  type WorkflowEvent,
  type RiskLevel,
  getDecisionCategory,
  getDecisionColor,
  getRiskColor,
  formatDecisionLabel,
  DECISION_DESCRIPTIONS,
} from "@/lib/types";

type StepStatus = "pending" | "running" | "completed" | "failed";

interface AgentTrace {
  type: "thinking" | "finding" | "detail" | "tool_call" | "kb_query";
  timestamp: string;
  content: string;
  severity?: "info" | "warning" | "critical";
  details?: Record<string, unknown>;
}

interface StepResult {
  status: StepStatus;
  summary?: string;
  details?: Record<string, unknown>;
  startTime?: string;
  endTime?: string;
  elapsed_ms?: number;
  traces?: AgentTrace[];
}

const stepConfig: Record<WorkflowStep, { icon: typeof Shield; label: string; color: string }> = {
  intake: { icon: FileText, label: "Payment Intake", color: "blue" },
  sanctions: { icon: Shield, label: "Sanctions Screening", color: "red" },
  liquidity: { icon: Banknote, label: "Liquidity Check", color: "purple" },
  procedures: { icon: FileCheck, label: "Procedures", color: "emerald" },
  summarize: { icon: CheckCircle2, label: "Decision", color: "amber" },
};

export default function RunPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.runId as string;

  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [steps, setSteps] = useState<Record<WorkflowStep, StepResult>>({
    intake: { status: "pending" },
    sanctions: { status: "pending" },
    liquidity: { status: "pending" },
    procedures: { status: "pending" },
    summarize: { status: "pending" },
  });
  const [payment, setPayment] = useState<Partial<PaymentDetails>>({});
  const [decision, setDecision] = useState<DecisionPacket | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["conditions", "approvals", "checklist", "citations"]));

  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!runId) return;

    // Connect to SSE stream
    const eventSource = new EventSource(`/api/runbook/stream/${runId}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: WorkflowEvent = JSON.parse(event.data);
        setEvents((prev) => [...prev, data]);

        // Update step status based on event type
        if (data.type === "step_started") {
          setSteps((prev) => ({
            ...prev,
            [data.step]: { ...prev[data.step], status: "running", startTime: data.ts, traces: [] },
          }));
        } else if (data.type === "step_completed") {
          setSteps((prev) => ({
            ...prev,
            [data.step]: {
              ...prev[data.step],
              status: "completed",
              endTime: data.ts,
              elapsed_ms: data.elapsed_ms,
              summary: data.payload?.summary as string,
              details: data.payload,
            },
          }));

          // Extract payment details from intake step
          if (data.step === "intake" && data.payload?.payment) {
            setPayment(data.payload.payment as PaymentDetails);
          }
        } else if (data.type === "step_failed" || data.type === "error") {
          setSteps((prev) => ({
            ...prev,
            [data.step]: { ...prev[data.step], status: "failed", summary: data.payload?.error as string },
          }));
          setError(data.payload?.error as string);
        } else if (data.type === "final") {
          setDecision(data.payload?.decision_packet as DecisionPacket);
          setSteps((prev) => ({
            ...prev,
            summarize: { ...prev.summarize, status: "completed", elapsed_ms: data.elapsed_ms },
          }));
          setIsComplete(true);
        } else if (data.type === "agent_thinking") {
          // Add thinking trace to current step
          setSteps((prev) => ({
            ...prev,
            [data.step]: {
              ...prev[data.step],
              traces: [
                ...(prev[data.step].traces || []),
                {
                  type: "thinking" as const,
                  timestamp: data.ts,
                  content: data.payload?.thought as string,
                  details: data.payload?.context as Record<string, unknown>,
                },
              ],
            },
          }));
        } else if (data.type === "agent_finding") {
          // Add finding trace to current step
          setSteps((prev) => ({
            ...prev,
            [data.step]: {
              ...prev[data.step],
              traces: [
                ...(prev[data.step].traces || []),
                {
                  type: "finding" as const,
                  timestamp: data.ts,
                  content: data.payload?.finding as string,
                  severity: data.payload?.severity as "info" | "warning" | "critical",
                  details: data.payload?.details as Record<string, unknown>,
                },
              ],
            },
          }));
        } else if (data.type === "agent_detail") {
          // Add detail trace to current step
          setSteps((prev) => ({
            ...prev,
            [data.step]: {
              ...prev[data.step],
              traces: [
                ...(prev[data.step].traces || []),
                {
                  type: "detail" as const,
                  timestamp: data.ts,
                  content: `${data.payload?.label}: ${data.payload?.value}`,
                  details: { category: data.payload?.category },
                },
              ],
            },
          }));
        } else if (data.type === "tool_call") {
          // Add tool call trace
          setSteps((prev) => ({
            ...prev,
            [data.step]: {
              ...prev[data.step],
              traces: [
                ...(prev[data.step].traces || []),
                {
                  type: "tool_call" as const,
                  timestamp: data.ts,
                  content: `Tool: ${data.payload?.tool} → ${data.payload?.output}`,
                  details: data.payload as Record<string, unknown>,
                },
              ],
            },
          }));
        } else if (data.type === "kb_query") {
          // Add KB query trace
          setSteps((prev) => ({
            ...prev,
            [data.step]: {
              ...prev[data.step],
              traces: [
                ...(prev[data.step].traces || []),
                {
                  type: "kb_query" as const,
                  timestamp: data.ts,
                  content: `KB Query: "${data.payload?.query}" → ${data.payload?.results_count} results`,
                  details: { sources: data.payload?.sources },
                },
              ],
            },
          }));
        }
      } catch (err) {
        console.error("Failed to parse SSE event:", err);
      }
    };

    eventSource.onerror = () => {
      console.log("SSE connection closed");
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [runId]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const getDecisionIcon = (dec: PrimaryDecision) => {
    const category = getDecisionCategory(dec);
    switch (category) {
      case "release": return CheckCircle2;
      case "hold": return Pause;
      case "defer": return Clock;
      case "escalate": return ArrowUpRight;
      case "reject": return XCircle;
      default: return Clock;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/30 glass sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-teal-500" />
              <span className="font-semibold">Payment Processing</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">
              {runId.slice(0, 8)}...
            </span>
            {isComplete && (
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Status Banner */}
      <div className="border-b border-border/30 bg-surface-1">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {!isComplete ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500" />
                  </span>
                  <span className="text-sm font-medium text-teal-500">PROCESSING</span>
                </>
              ) : decision ? (
                <>
                  <span className={`w-2 h-2 rounded-full bg-${getDecisionColor(decision.decision)}-500`} />
                  <span className={`text-sm font-medium text-${getDecisionColor(decision.decision)}-500`}>
                    {decision.decision}
                  </span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-gray-500" />
                  <span className="text-sm font-medium text-gray-500">UNKNOWN</span>
                </>
              )}
            </div>

            {payment.beneficiary_name && (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">
                  <User className="w-4 h-4 inline mr-1" />
                  {payment.beneficiary_name}
                </span>
                {payment.amount && (
                  <span className="font-medium">
                    <DollarSign className="w-4 h-4 inline mr-0.5" />
                    {payment.amount.toLocaleString()} {payment.currency || "USD"}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Steps Progress */}
          <div className="lg:col-span-1 space-y-4">
            <h2 className="font-semibold mb-4">Processing Steps</h2>

            {(Object.keys(stepConfig) as WorkflowStep[]).map((step) => {
              const config = stepConfig[step];
              const result = steps[step];
              const Icon = config.icon;

              return (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`p-4 rounded-xl border transition-all ${
                    result.status === "running"
                      ? "border-teal-500/50 bg-teal-500/5"
                      : result.status === "completed"
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : result.status === "failed"
                      ? "border-red-500/30 bg-red-500/5"
                      : "border-border/30 bg-card"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      result.status === "running"
                        ? "bg-teal-500/20"
                        : result.status === "completed"
                        ? "bg-emerald-500/20"
                        : result.status === "failed"
                        ? "bg-red-500/20"
                        : "bg-surface-2"
                    }`}>
                      {result.status === "running" ? (
                        <Clock className="w-5 h-5 text-teal-500 animate-spin" />
                      ) : result.status === "completed" ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : result.status === "failed" ? (
                        <XCircle className="w-5 h-5 text-red-500" />
                      ) : (
                        <Icon className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm">{config.label}</h3>
                      {result.summary && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {result.summary}
                        </p>
                      )}
                      {result.elapsed_ms && (
                        <span className="text-xs text-muted-foreground">
                          {(result.elapsed_ms / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Agent Traces */}
                  {result.traces && result.traces.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/20 space-y-2">
                      {result.traces.map((trace, idx) => (
                        <div
                          key={idx}
                          className={`text-xs p-2 rounded-lg ${
                            trace.type === "finding" && trace.severity === "critical"
                              ? "bg-red-500/10 text-red-400 border-l-2 border-red-500"
                              : trace.type === "finding" && trace.severity === "warning"
                              ? "bg-amber-500/10 text-amber-400 border-l-2 border-amber-500"
                              : trace.type === "finding"
                              ? "bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-500"
                              : trace.type === "thinking"
                              ? "bg-blue-500/10 text-blue-400 border-l-2 border-blue-500"
                              : trace.type === "detail"
                              ? "bg-surface-2 text-muted-foreground"
                              : trace.type === "tool_call"
                              ? "bg-purple-500/10 text-purple-400 border-l-2 border-purple-500"
                              : "bg-teal-500/10 text-teal-400 border-l-2 border-teal-500"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {trace.type === "thinking" && <span className="opacity-70">💭</span>}
                            {trace.type === "finding" && trace.severity === "critical" && <span>🚨</span>}
                            {trace.type === "finding" && trace.severity === "warning" && <span>⚠️</span>}
                            {trace.type === "finding" && trace.severity === "info" && <span>✓</span>}
                            {trace.type === "detail" && <span className="opacity-70">📊</span>}
                            {trace.type === "tool_call" && <span className="opacity-70">🔧</span>}
                            {trace.type === "kb_query" && <span className="opacity-70">📚</span>}
                            <span className="flex-1">{trace.content}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Right Column: Decision Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Decision Card */}
            <AnimatePresence>
              {decision && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-6 rounded-2xl border-2 border-${getDecisionColor(decision.decision)}-500/50 bg-${getDecisionColor(decision.decision)}-500/5`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const DecIcon = getDecisionIcon(decision.decision);
                        return <DecIcon className={`w-8 h-8 text-${getDecisionColor(decision.decision)}-500`} />;
                      })()}
                      <div>
                        <h2 className={`text-2xl font-bold text-${getDecisionColor(decision.decision)}-500`}>
                          {formatDecisionLabel(decision.decision)}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {DECISION_DESCRIPTIONS[decision.decision] || "Final Decision"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge className={`bg-${getDecisionColor(decision.decision)}-500/10 text-${getDecisionColor(decision.decision)}-500 border-${getDecisionColor(decision.decision)}-500/20`}>
                        {payment.currency || "USD"} {payment.amount?.toLocaleString()}
                      </Badge>
                      {decision.approved_amount && decision.approved_amount !== payment.amount && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Approved: {payment.currency || "USD"} {decision.approved_amount.toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Risk Score */}
                  {decision.risk_score !== undefined && (
                    <div className="mb-4 p-3 rounded-lg bg-surface-1">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Gauge className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Risk Assessment</span>
                        </div>
                        <Badge className={`bg-${getRiskColor(decision.risk_level || "low")}-500/10 text-${getRiskColor(decision.risk_level || "low")}-500`}>
                          {decision.risk_level?.toUpperCase() || "LOW"} ({decision.risk_score}/100)
                        </Badge>
                      </div>
                      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                        <div
                          className={`h-full bg-${getRiskColor(decision.risk_level || "low")}-500 transition-all duration-500`}
                          style={{ width: `${decision.risk_score}%` }}
                        />
                      </div>
                      {decision.risk_factors && decision.risk_factors.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {decision.risk_factors.slice(0, 3).map((factor, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded bg-surface-2 text-muted-foreground">
                              {factor.factor}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Summary */}
                  {decision.summary && (
                    <p className="text-sm text-muted-foreground mb-4 p-3 rounded-lg bg-surface-1 border-l-2 border-${getDecisionColor(decision.decision)}-500">
                      {decision.summary}
                    </p>
                  )}

                  {/* Rationale */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Rationale</h3>
                    <ul className="space-y-1">
                      {decision.rationale.map((r, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className={`text-${getDecisionColor(decision.decision)}-500 mt-1`}>•</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Operational Procedures Summary - Always visible when decision exists */}
            {decision && ((decision.procedure_checklist?.length ?? 0) > 0 || (decision.approvals_required?.length ?? 0) > 0) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="p-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <FileCheck className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-emerald-500">Operational Procedures</h2>
                    <p className="text-sm text-muted-foreground">Required actions based on the decision</p>
                  </div>
                </div>

                {/* Quick Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {decision.procedure_checklist && decision.procedure_checklist.length > 0 && (
                    <div className="p-3 rounded-lg bg-surface-1 text-center">
                      <p className="text-2xl font-bold text-emerald-500">{decision.procedure_checklist.length}</p>
                      <p className="text-xs text-muted-foreground">Steps Required</p>
                    </div>
                  )}
                  {decision.approvals_required && decision.approvals_required.length > 0 && (
                    <div className="p-3 rounded-lg bg-surface-1 text-center">
                      <p className="text-2xl font-bold text-blue-500">{decision.approvals_required.length}</p>
                      <p className="text-xs text-muted-foreground">Approvals Needed</p>
                    </div>
                  )}
                  {decision.sod_constraints && decision.sod_constraints.length > 0 && (
                    <div className="p-3 rounded-lg bg-surface-1 text-center">
                      <p className="text-2xl font-bold text-red-500">{decision.sod_constraints.length}</p>
                      <p className="text-xs text-muted-foreground">SoD Controls</p>
                    </div>
                  )}
                  {decision.citations && decision.citations.length > 0 && (
                    <div className="p-3 rounded-lg bg-surface-1 text-center">
                      <p className="text-2xl font-bold text-teal-500">{decision.citations.length}</p>
                      <p className="text-xs text-muted-foreground">Policy Citations</p>
                    </div>
                  )}
                </div>

                {/* Key Actions Preview */}
                {decision.procedure_checklist && decision.procedure_checklist.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Key Actions:</h3>
                    <div className="space-y-1">
                      {decision.procedure_checklist.slice(0, 3).map((item) => (
                        <div key={item.step_number} className="flex items-center gap-2 text-sm">
                          <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xs font-medium flex-shrink-0">
                            {item.step_number}
                          </span>
                          <span className="text-foreground">{item.action}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{item.responsible}</span>
                        </div>
                      ))}
                      {decision.procedure_checklist.length > 3 && (
                        <p className="text-xs text-muted-foreground pl-7">
                          + {decision.procedure_checklist.length - 3} more steps...
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Key Approvers Preview */}
                {decision.approvals_required && decision.approvals_required.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border/30">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Required Approvers:</h3>
                    <div className="flex flex-wrap gap-2">
                      {decision.approvals_required.map((approval, i) => (
                        <Badge key={i} className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                          <User className="w-3 h-3 mr-1" />
                          {approval.role}
                          <span className="ml-1 text-xs opacity-70">({approval.sla_hours}h SLA)</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Dynamic Conditions */}
            {decision?.conditions && decision.conditions.length > 0 && (
              <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
                <button
                  onClick={() => toggleSection("conditions")}
                  className="w-full p-4 flex items-center justify-between hover:bg-surface-1 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Lock className="w-5 h-5 text-teal-500" />
                    <h3 className="font-semibold">Conditions to Satisfy</h3>
                    <Badge variant="outline" className="text-xs">
                      {decision.conditions.filter(c => !c.satisfied).length} pending
                    </Badge>
                  </div>
                  {expandedSections.has("conditions") ? (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
                <AnimatePresence>
                  {expandedSections.has("conditions") && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 pt-0 space-y-2">
                        {decision.conditions.map((condition) => (
                          <div
                            key={condition.id}
                            className={`flex items-center gap-3 p-3 rounded-lg ${
                              condition.satisfied ? "bg-emerald-500/5" : "bg-amber-500/5"
                            }`}
                          >
                            {condition.satisfied ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                            ) : (
                              <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />
                            )}
                            <div className="flex-1">
                              <p className="text-sm font-medium">{condition.description}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">{condition.type}</Badge>
                                {condition.deadline && (
                                  <span className="text-xs text-muted-foreground">
                                    Due: {new Date(condition.deadline).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Required Documents */}
            {decision?.required_documents && decision.required_documents.length > 0 && (
              <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
                <button
                  onClick={() => toggleSection("documents")}
                  className="w-full p-4 flex items-center justify-between hover:bg-surface-1 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-500" />
                    <h3 className="font-semibold">Required Documents</h3>
                    <Badge variant="outline" className="text-xs">
                      {decision.required_documents.filter(d => d.status === "received").length}/{decision.required_documents.length} received
                    </Badge>
                  </div>
                  {expandedSections.has("documents") ? (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
                <AnimatePresence>
                  {expandedSections.has("documents") && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 pt-0 space-y-2">
                        {decision.required_documents.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg bg-surface-1">
                            <div className="flex items-center gap-3">
                              {doc.status === "received" ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              ) : doc.status === "pending" ? (
                                <Clock className="w-4 h-4 text-amber-500" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-500" />
                              )}
                              <div>
                                <p className="text-sm font-medium">{doc.name}</p>
                                <p className="text-xs text-muted-foreground">{doc.type}</p>
                              </div>
                            </div>
                            <Badge
                              className={
                                doc.status === "received"
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : doc.status === "pending"
                                  ? "bg-amber-500/10 text-amber-500"
                                  : "bg-red-500/10 text-red-500"
                              }
                            >
                              {doc.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Procedure Checklist */}
            {decision?.procedure_checklist && decision.procedure_checklist.length > 0 && (
              <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
                <button
                  onClick={() => toggleSection("checklist")}
                  className="w-full p-4 flex items-center justify-between hover:bg-surface-1 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-5 h-5 text-emerald-500" />
                    <h3 className="font-semibold">Procedure Checklist</h3>
                    <Badge variant="outline" className="text-xs">
                      {decision.procedure_checklist.length} steps
                    </Badge>
                  </div>
                  {expandedSections.has("checklist") ? (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
                <AnimatePresence>
                  {expandedSections.has("checklist") && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 pt-0 space-y-3">
                        {decision.procedure_checklist.map((item) => (
                          <div key={item.step_number} className="flex gap-3 p-3 rounded-lg bg-surface-1">
                            <span className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xs font-medium flex-shrink-0">
                              {item.step_number}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{item.action}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.responsible} • {item.documentation_required}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Required Approvals */}
            {decision?.approvals_required && decision.approvals_required.length > 0 && (
              <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
                <button
                  onClick={() => toggleSection("approvals")}
                  className="w-full p-4 flex items-center justify-between hover:bg-surface-1 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <User className="w-5 h-5 text-blue-500" />
                    <h3 className="font-semibold">Required Approvals</h3>
                    <Badge variant="outline" className="text-xs">
                      {decision.approvals_required.length} approvers
                    </Badge>
                  </div>
                  {expandedSections.has("approvals") ? (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
                <AnimatePresence>
                  {expandedSections.has("approvals") && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 pt-0 space-y-3">
                        {decision.approvals_required.map((approval, i) => (
                          <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface-1">
                            <div>
                              <p className="text-sm font-medium">{approval.role}</p>
                              <p className="text-xs text-muted-foreground">
                                {("authority" in approval ? approval.authority : (approval as { authority_level?: string }).authority_level) || ""}
                              </p>
                            </div>
                            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                              SLA: {approval.sla_hours}h
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* SoD Constraints */}
            {decision?.sod_constraints && decision.sod_constraints.length > 0 && (
              <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
                <button
                  onClick={() => toggleSection("sod")}
                  className="w-full p-4 flex items-center justify-between hover:bg-surface-1 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-red-500" />
                    <h3 className="font-semibold">Separation of Duties</h3>
                  </div>
                  {expandedSections.has("sod") ? (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
                <AnimatePresence>
                  {expandedSections.has("sod") && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 pt-0">
                        <ul className="space-y-2">
                          {decision.sod_constraints.map((constraint, i) => (
                            <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                              {typeof constraint === "string" ? constraint : constraint.description}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Citations */}
            {decision?.citations && decision.citations.length > 0 && (
              <div className="rounded-xl border border-border/30 bg-card overflow-hidden">
                <button
                  onClick={() => toggleSection("citations")}
                  className="w-full p-4 flex items-center justify-between hover:bg-surface-1 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-teal-500" />
                    <h3 className="font-semibold">Policy Citations</h3>
                    <Badge variant="outline" className="text-xs">
                      {decision.citations.length} sources
                    </Badge>
                  </div>
                  {expandedSections.has("citations") ? (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
                <AnimatePresence>
                  {expandedSections.has("citations") && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: "auto" }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 pt-0 space-y-3">
                        {decision.citations.map((citation, i) => (
                          <div key={i} className="p-3 rounded-lg bg-surface-1">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-teal-500">{citation.source}</span>
                              {("reference" in citation ? citation.reference : (citation as { url?: string }).url) && (
                                <a href="#" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                                  View <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground italic">&quot;{citation.snippet}&quot;</p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Loading State */}
            {!isComplete && !decision && (
              <div className="p-8 rounded-xl border border-border/30 bg-card text-center">
                <div className="w-12 h-12 rounded-full bg-teal-500/10 flex items-center justify-center mx-auto mb-4">
                  <Clock className="w-6 h-6 text-teal-500 animate-spin" />
                </div>
                <h3 className="font-semibold mb-2">Processing Payment</h3>
                <p className="text-sm text-muted-foreground">
                  Running compliance checks and determining workflow...
                </p>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="p-6 rounded-xl border border-red-500/30 bg-red-500/5">
                <div className="flex items-start gap-3">
                  <XCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-red-500 mb-1">Processing Error</h3>
                    <p className="text-sm text-muted-foreground">{error}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
