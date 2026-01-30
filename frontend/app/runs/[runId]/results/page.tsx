"use client";

import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Download, Share2, FileText, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrchestratorStore } from "@/store/orchestrator-store";
import { PortfolioSummary } from "@/components/results/portfolio-summary";
import { ScenarioSlider } from "@/components/results/scenario-slider";
import { AuditTrail } from "@/components/results/audit-trail";

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.runId as string;

  const { portfolio, decisions, evidence } = useOrchestratorStore();

  const handleExportPDF = () => {
    // In production, generate PDF
    alert("PDF export would be generated here");
  };

  const handleExportJSON = () => {
    const data = {
      runId,
      portfolio,
      decisions,
      evidence,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-${runId}.json`;
    a.click();
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    alert("Link copied to clipboard!");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push(`/runs/${runId}`)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Mission Control
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="w-4 h-4 mr-1" />
              Share
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportJSON}>
              <Download className="w-4 h-4 mr-1" />
              JSON
            </Button>
            <Button size="sm" onClick={handleExportPDF} className="bg-amber-500 hover:bg-amber-600">
              <FileText className="w-4 h-4 mr-1" />
              Export PDF
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold mb-2">Portfolio Results</h1>
          <p className="text-muted-foreground">
            Your optimized portfolio allocation based on your investment policy statement
          </p>
        </motion.div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Portfolio Summary (2 cols) */}
          <div className="lg:col-span-2 space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <PortfolioSummary portfolio={portfolio} />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <ScenarioSlider portfolio={portfolio} />
            </motion.div>
          </div>

          {/* Right: Audit Trail */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <AuditTrail decisions={decisions} evidence={evidence} />
          </motion.div>
        </div>

        {/* Rationale Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-8 p-6 bg-card border border-border/30 rounded-xl"
        >
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-500" />
            Portfolio Rationale
          </h2>
          <div className="prose prose-sm prose-invert max-w-none">
            <p>
              This portfolio was constructed using a multi-agent optimization system that
              balanced your stated objectives against market constraints and risk limits.
            </p>
            <ul>
              <li>
                <strong>Objective:</strong> Maximize risk-adjusted returns (Sharpe ratio)
                while respecting your allocation constraints
              </li>
              <li>
                <strong>Constraints enforced:</strong> Equity allocation limits, position
                concentration limits, and minimum diversification requirements
              </li>
              <li>
                <strong>Risk management:</strong> Portfolio volatility and drawdown
                expectations aligned with your risk tolerance
              </li>
              <li>
                <strong>Trade-offs:</strong> Higher expected returns were sacrificed for
                lower volatility to meet your risk constraints
              </li>
            </ul>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
