"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  MessageSquare,
  Compass,
  History,
  Brain,
  Shield,
  LineChart,
  Sparkles,
  Users,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const router = useRouter();

  const capabilities = [
    {
      icon: Brain,
      title: "Dynamic Orchestrator",
      description: "LLM-powered orchestrator dynamically assigns tasks to specialized agents",
    },
    {
      icon: Users,
      title: "Multi-Agent Collaboration",
      description: "5 specialized agents: Market, Risk, Return, Optimizer, Compliance",
    },
    {
      icon: LineChart,
      title: "Real-Time Visibility",
      description: "Watch agent reasoning and decisions unfold in Mission Control",
    },
    {
      icon: Shield,
      title: "Full Explainability",
      description: "Every decision includes reasoning, evidence, and alternatives considered",
    },
    {
      icon: Target,
      title: "Personalized Portfolios",
      description: "Tailored to your risk appetite, constraints, and investment themes",
    },
    {
      icon: Sparkles,
      title: "Hedge-Fund Grade",
      description: "Professional-quality optimization with institutional best practices",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/30 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <span className="text-white font-bold text-lg">P</span>
            </div>
            <div>
              <span className="font-semibold text-lg block leading-tight">Portfolio Optimizer</span>
              <span className="text-xs text-muted-foreground">Multi-Agent System</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.push("/ic")}>
            Legacy Dashboard
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-4xl mx-auto py-20"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm mb-6"
          >
            <Sparkles className="w-4 h-4" />
            AI-Powered Portfolio Construction
          </motion.div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
            Institutional-Grade
            <br />
            <span className="text-gold-gradient">Portfolio Optimization</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
            Watch our multi-agent system construct your optimal portfolio in real-time.
            Full transparency into every decision, every trade-off, every recommendation.
          </p>

          {/* Three Entry Points */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Guided Onboarding */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="group relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <button
                onClick={() => router.push("/onboarding")}
                className="relative w-full p-8 rounded-2xl bg-card border border-border/50 hover:border-amber-500/50 transition-all text-left group-hover:shadow-lg group-hover:shadow-amber-500/5"
              >
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-5 shadow-lg shadow-amber-500/20">
                  <Compass className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Guided Onboarding</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Step-by-step wizard to define your investment profile and constraints
                </p>
                <div className="flex items-center text-amber-500 text-sm font-medium">
                  Start guided setup
                  <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            </motion.div>

            {/* Chat-First */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="group relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <button
                onClick={() => router.push("/onboarding?mode=chat")}
                className="relative w-full p-8 rounded-2xl bg-card border border-border/50 hover:border-blue-500/50 transition-all text-left group-hover:shadow-lg group-hover:shadow-blue-500/5"
              >
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center mb-5 shadow-lg shadow-blue-500/20">
                  <MessageSquare className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Chat with Advisor</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Tell us your goals in natural language and we&apos;ll build your profile
                </p>
                <div className="flex items-center text-blue-500 text-sm font-medium">
                  Start conversation
                  <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            </motion.div>

            {/* Previous Runs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.4 }}
              className="group relative"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <button
                onClick={() => router.push("/ic")}
                className="relative w-full p-8 rounded-2xl bg-card border border-border/50 hover:border-emerald-500/50 transition-all text-left group-hover:shadow-lg group-hover:shadow-emerald-500/5"
              >
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mb-5 shadow-lg shadow-emerald-500/20">
                  <History className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Previous Runs</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  View history, replay workflows, and export previous portfolios
                </p>
                <div className="flex items-center text-emerald-500 text-sm font-medium">
                  View history
                  <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            </motion.div>
          </div>
        </motion.div>

        {/* Capabilities */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="py-16"
        >
          <h2 className="text-2xl font-bold text-center mb-12">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {capabilities.map((cap, index) => (
              <motion.div
                key={cap.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.6 + 0.1 * index }}
                className="p-6 rounded-xl bg-surface-1 border border-border/30"
              >
                <cap.icon className="w-8 h-8 text-amber-500 mb-4" />
                <h3 className="font-semibold mb-2">{cap.title}</h3>
                <p className="text-muted-foreground text-sm">{cap.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Agent Preview */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="py-16"
        >
          <div className="p-8 rounded-2xl bg-gradient-to-br from-surface-1 to-surface-2 border border-border/30">
            <h2 className="text-2xl font-bold text-center mb-8">
              Meet Your Agent Team
            </h2>
            <div className="flex flex-wrap justify-center gap-4">
              {[
                { name: "Orchestrator", role: "Coordinator", color: "amber" },
                { name: "Market Agent", role: "Data & Universe", color: "blue" },
                { name: "Risk Agent", role: "Constraints", color: "red" },
                { name: "Return Agent", role: "Forecasting", color: "green" },
                { name: "Optimizer Agent", role: "Allocation", color: "purple" },
                { name: "Compliance Agent", role: "Verification", color: "cyan" },
              ].map((agent) => (
                <div
                  key={agent.name}
                  className={`flex items-center gap-3 px-5 py-3 rounded-full bg-${agent.color}-500/10 border border-${agent.color}-500/20`}
                >
                  <div className={`w-3 h-3 rounded-full bg-${agent.color}-500`} />
                  <div>
                    <span className="font-medium text-sm block">{agent.name}</span>
                    <span className="text-xs text-muted-foreground">{agent.role}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 mt-12">
        <div className="container mx-auto px-6 py-8 text-center text-muted-foreground text-sm">
          Portfolio Optimizer - Powered by Multi-Agent Orchestration
        </div>
      </footer>
    </div>
  );
}
