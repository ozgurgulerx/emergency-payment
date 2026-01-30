"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Pause,
  ArrowUpRight,
  Shield,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Decision = "RELEASE" | "HOLD" | "PARTIAL" | "ESCALATE" | "REJECT";

interface RunSummary {
  run_id: string;
  beneficiary: string;
  amount: number;
  currency: string;
  decision: Decision;
  created_at: string;
  status: "completed" | "in_progress" | "failed";
}

export default function HistoryPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/runbook/history");
      if (response.ok) {
        const data = await response.json();
        setRuns(data.runs || []);
      } else {
        // Demo data when backend unavailable
        setRuns(getDemoRuns());
      }
    } catch {
      setRuns(getDemoRuns());
    } finally {
      setIsLoading(false);
    }
  };

  const getDemoRuns = (): RunSummary[] => [
    {
      run_id: "demo-1706644800000-abc123",
      beneficiary: "ACME Corp Inc",
      amount: 250000,
      currency: "USD",
      decision: "RELEASE",
      created_at: new Date(Date.now() - 3600000).toISOString(),
      status: "completed",
    },
    {
      run_id: "demo-1706641200000-def456",
      beneficiary: "Global Trade Partners Ltd",
      amount: 500000,
      currency: "USD",
      decision: "HOLD",
      created_at: new Date(Date.now() - 7200000).toISOString(),
      status: "completed",
    },
    {
      run_id: "demo-1706637600000-ghi789",
      beneficiary: "Deutsche Bank AG",
      amount: 150000,
      currency: "EUR",
      decision: "RELEASE",
      created_at: new Date(Date.now() - 86400000).toISOString(),
      status: "completed",
    },
    {
      run_id: "demo-1706634000000-jkl012",
      beneficiary: "Suspicious Entity LLC",
      amount: 1000000,
      currency: "USD",
      decision: "REJECT",
      created_at: new Date(Date.now() - 172800000).toISOString(),
      status: "completed",
    },
  ];

  const getDecisionIcon = (decision: Decision) => {
    switch (decision) {
      case "RELEASE":
        return <CheckCircle2 className="w-4 h-4" />;
      case "HOLD":
        return <Pause className="w-4 h-4" />;
      case "PARTIAL":
        return <ArrowUpRight className="w-4 h-4" />;
      case "ESCALATE":
        return <AlertTriangle className="w-4 h-4" />;
      case "REJECT":
        return <XCircle className="w-4 h-4" />;
    }
  };

  const getDecisionColor = (decision: Decision) => {
    switch (decision) {
      case "RELEASE":
        return "text-emerald-500 bg-emerald-500/10 border-emerald-500/30";
      case "HOLD":
        return "text-amber-500 bg-amber-500/10 border-amber-500/30";
      case "PARTIAL":
        return "text-blue-500 bg-blue-500/10 border-blue-500/30";
      case "ESCALATE":
        return "text-orange-500 bg-orange-500/10 border-orange-500/30";
      case "REJECT":
        return "text-red-500 bg-red-500/10 border-red-500/30";
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) {
      return "Just now";
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/30 glass sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div className="h-6 w-px bg-border" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 via-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-semibold text-lg block leading-tight">Payment History</span>
                <span className="text-xs text-muted-foreground">Past runbook executions</span>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchHistory} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-6 rounded-xl bg-card border border-border/50">
                <div className="shimmer h-6 w-48 rounded mb-3" />
                <div className="shimmer h-4 w-32 rounded" />
              </div>
            ))}
          </div>
        ) : runs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No payment history</h2>
            <p className="text-muted-foreground mb-6">
              Process your first emergency payment to see it here.
            </p>
            <Button onClick={() => router.push("/")} className="btn-primary">
              Process Payment
            </Button>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {runs.map((run, index) => (
              <motion.div
                key={run.run_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => router.push(`/runs/${run.run_id}`)}
                className="p-5 rounded-xl bg-card border border-border/50 hover:border-gold/30 hover:shadow-lg hover:shadow-black/5 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg group-hover:text-gold transition-colors">
                        {run.beneficiary}
                      </h3>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getDecisionColor(
                          run.decision
                        )}`}
                      >
                        {getDecisionIcon(run.decision)}
                        {run.decision}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="font-mono">{formatCurrency(run.amount, run.currency)}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDate(run.created_at)}
                      </span>
                      <span className="font-mono text-xs opacity-50">{run.run_id.slice(0, 20)}...</span>
                    </div>
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-muted-foreground group-hover:text-gold transition-colors" />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
