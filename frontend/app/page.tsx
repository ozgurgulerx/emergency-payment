"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Send,
  Shield,
  Banknote,
  FileCheck,
  ArrowRight,
  History,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/runbook/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        router.push(`/runs/${data.run_id}`);
      } else {
        console.error("Failed to start runbook");
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error("Error:", error);
      setIsSubmitting(false);
    }
  };

  const examples = [
    "Release $250,000 USD to ACME Corp Inc for Q4 supplies",
    "Process urgent payment of €150,000 to Deutsche Bank AG",
    "Transfer $500,000 to Global Trade Partners Ltd",
    "Pay £75,000 to Smith & Associates for consulting fees",
  ];

  const agents = [
    {
      icon: Shield,
      name: "Sanctions Screening",
      description: "OFAC SDN list verification",
      color: "red",
    },
    {
      icon: Banknote,
      name: "Liquidity Check",
      description: "Buffer threshold validation",
      color: "blue",
    },
    {
      icon: FileCheck,
      name: "Procedures",
      description: "Approval matrix & workflow",
      color: "emerald",
    },
  ];

  const decisionCategories = [
    {
      category: "Release",
      color: "emerald",
      icon: CheckCircle2,
      decisions: [
        { label: "RELEASE", description: "Immediate processing" },
        { label: "RELEASE_WITH_CONDITIONS", description: "With requirements" },
        { label: "PARTIAL_RELEASE", description: "Partial amount" },
      ],
    },
    {
      category: "Hold",
      color: "amber",
      icon: Clock,
      decisions: [
        { label: "HOLD_PENDING_APPROVAL", description: "Awaiting approver" },
        { label: "HOLD_PENDING_DOCUMENTATION", description: "Missing docs" },
        { label: "HOLD_DUAL_CONTROL", description: "Dual authorization" },
      ],
    },
    {
      category: "Escalate",
      color: "orange",
      icon: AlertTriangle,
      decisions: [
        { label: "ESCALATE_COMPLIANCE", description: "Compliance review" },
        { label: "ESCALATE_MANAGEMENT", description: "Management review" },
        { label: "ESCALATE_LEGAL", description: "Legal review" },
      ],
    },
    {
      category: "Reject",
      color: "red",
      icon: Shield,
      decisions: [
        { label: "REJECT_SANCTIONS", description: "Sanctions match" },
        { label: "REJECT_LIQUIDITY", description: "Insufficient funds" },
        { label: "REJECT_POLICY", description: "Policy violation" },
        { label: "REJECT_FRAUD_RISK", description: "Fraud indicators" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/30 glass sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 via-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-semibold text-lg block leading-tight">Emergency Payment</span>
              <span className="text-xs text-muted-foreground">Runbook Processing System</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.push("/history")}>
            <History className="w-4 h-4 mr-2" />
            History
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-500 text-sm mb-6">
            <Shield className="w-4 h-4" />
            Compliance-First Payment Processing
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Emergency Payment
            <br />
            <span className="text-teal-gradient">Runbook</span>
          </h1>

          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Process urgent payments with automated sanctions screening, liquidity checks,
            and operational procedure compliance. Full audit trail included.
          </p>
        </motion.div>

        {/* Payment Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="max-w-3xl mx-auto mb-12"
        >
          <div className="p-6 rounded-2xl bg-card border border-border/50">
            <label className="block text-sm font-medium mb-3">
              Describe your payment request
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g., Release $250,000 USD to ACME Corp Inc for Q4 supplies"
              className="input-base min-h-[120px] mb-4"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.metaKey) handleSubmit();
              }}
            />

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Press <kbd className="px-1.5 py-0.5 rounded bg-surface-2 text-xs">⌘ Enter</kbd> to submit
              </p>
              <Button
                onClick={handleSubmit}
                disabled={!message.trim() || isSubmitting}
                className="btn-primary"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4 animate-spin" />
                    Processing...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Process Payment
                    <Send className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </div>

            {/* Example Requests */}
            <div className="mt-6 pt-4 border-t border-border/30">
              <p className="text-xs text-muted-foreground mb-3">Quick examples:</p>
              <div className="flex flex-wrap gap-2">
                {examples.map((example) => (
                  <button
                    key={example}
                    onClick={() => setMessage(example)}
                    className="text-xs px-3 py-1.5 rounded-full bg-surface-2 hover:bg-surface-3 transition-colors text-left"
                  >
                    {example.length > 50 ? example.slice(0, 50) + "..." : example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Agent Pipeline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="max-w-4xl mx-auto mb-12"
        >
          <h2 className="text-xl font-semibold text-center mb-6">
            Three-Agent Compliance Pipeline
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {agents.map((agent, index) => {
              const Icon = agent.icon;
              return (
                <div key={agent.name} className="relative">
                  <div className={`p-5 rounded-xl bg-surface-1 border border-border/30 hover:border-${agent.color}-500/30 transition-colors`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg bg-${agent.color}-500/10 flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-5 h-5 text-${agent.color}-500`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground">Agent {index + 1}</span>
                        </div>
                        <h3 className="font-semibold">{agent.name}</h3>
                        <p className="text-sm text-muted-foreground">{agent.description}</p>
                      </div>
                    </div>
                  </div>
                  {index < agents.length - 1 && (
                    <div className="hidden md:flex absolute top-1/2 -right-2 transform -translate-y-1/2 z-10">
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Decision Types */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="max-w-5xl mx-auto"
        >
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold">
              Dynamic Decision Outcomes
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              20+ possible decisions based on risk scoring, compliance checks, and dynamic conditions
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {decisionCategories.map((category) => {
              const Icon = category.icon;
              return (
                <div
                  key={category.category}
                  className={`p-4 rounded-xl bg-${category.color}-500/5 border border-${category.color}-500/20`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className={`w-5 h-5 text-${category.color}-500`} />
                    <span className={`font-semibold text-${category.color}-500`}>{category.category}</span>
                  </div>
                  <div className="space-y-2">
                    {category.decisions.map((decision) => (
                      <div key={decision.label} className="flex items-start gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full bg-${category.color}-500 mt-1.5 flex-shrink-0`} />
                        <div>
                          <p className="text-xs font-medium">{decision.label.replace(/_/g, " ")}</p>
                          <p className="text-xs text-muted-foreground">{decision.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Risk Score Indicator */}
          <div className="mt-6 p-4 rounded-xl bg-surface-1 border border-border/30">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Risk Score Spectrum</span>
              <span className="text-xs text-muted-foreground">Influences decision routing</span>
            </div>
            <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 via-orange-500 to-red-500" />
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>0 - Low Risk</span>
              <span>25 - Medium</span>
              <span>50 - High</span>
              <span>75 - Critical</span>
              <span>100</span>
            </div>
          </div>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="max-w-4xl mx-auto mt-16"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div>
              <div className="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center mx-auto mb-3">
                <Shield className="w-6 h-6 text-teal-500" />
              </div>
              <h3 className="font-semibold mb-1">OFAC Compliance</h3>
              <p className="text-sm text-muted-foreground">
                Real-time sanctions screening against SDN list
              </p>
            </div>
            <div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                <FileCheck className="w-6 h-6 text-emerald-500" />
              </div>
              <h3 className="font-semibold mb-1">Full Audit Trail</h3>
              <p className="text-sm text-muted-foreground">
                Complete documentation with policy citations
              </p>
            </div>
            <div>
              <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                <Clock className="w-6 h-6 text-green-500" />
              </div>
              <h3 className="font-semibold mb-1">Real-Time Processing</h3>
              <p className="text-sm text-muted-foreground">
                Watch each agent process your request live
              </p>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 mt-16">
        <div className="container mx-auto px-6 py-6 text-center text-muted-foreground text-sm">
          Emergency Payment Runbook - Multi-Agent Compliance System
        </div>
      </footer>
    </div>
  );
}
