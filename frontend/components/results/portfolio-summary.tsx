"use client";

import { PortfolioAllocation } from "@/store/orchestrator-store";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { TrendingUp, Activity, Target, Shield } from "lucide-react";

interface PortfolioSummaryProps {
  portfolio: PortfolioAllocation;
}

const assetColors: Record<string, string> = {
  VTI: "#f59e0b",
  VOO: "#eab308",
  VEA: "#84cc16",
  VXUS: "#22c55e",
  VWO: "#10b981",
  BND: "#3b82f6",
  BNDX: "#6366f1",
  AGG: "#8b5cf6",
  VNQ: "#ec4899",
  VCSH: "#14b8a6",
  QQQ: "#f97316",
  CASH: "#64748b",
};

export function PortfolioSummary({ portfolio }: PortfolioSummaryProps) {
  const allocations = Object.entries(portfolio.allocations)
    .filter(([_, weight]) => weight > 0.001)
    .sort((a, b) => b[1] - a[1]);

  const pieData = allocations.map(([asset, weight]) => ({
    name: asset,
    value: Math.round(weight * 1000) / 10,
    fill: assetColors[asset] || "#666",
  }));

  const metrics = portfolio.metrics;

  // Calculate asset class breakdown
  const equityAssets = ["VTI", "VOO", "SPY", "VEA", "VXUS", "VWO", "QQQ", "IWM"];
  const bondAssets = ["BND", "BNDX", "AGG", "VCSH", "LQD"];

  const equityWeight = allocations
    .filter(([asset]) => equityAssets.includes(asset))
    .reduce((sum, [_, w]) => sum + w, 0);
  const bondWeight = allocations
    .filter(([asset]) => bondAssets.includes(asset))
    .reduce((sum, [_, w]) => sum + w, 0);
  const otherWeight = 1 - equityWeight - bondWeight;

  return (
    <div className="bg-card border border-border/30 rounded-xl p-6">
      <h2 className="text-xl font-semibold mb-6">Final Allocation</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Pie Chart */}
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}%`}
                labelLine={false}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [`${value}%`, "Allocation"]}
                contentStyle={{
                  backgroundColor: "hsl(var(--surface-1))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Metrics and Breakdown */}
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <MetricCard
              label="Expected Return"
              value={metrics.expectedReturn}
              suffix="%"
              icon={TrendingUp}
              color="text-green-500"
            />
            <MetricCard
              label="Volatility"
              value={metrics.volatility}
              suffix="%"
              icon={Activity}
              color="text-amber-500"
            />
            <MetricCard
              label="Sharpe Ratio"
              value={metrics.sharpe}
              icon={Target}
              color="text-blue-500"
            />
            <MetricCard
              label="VaR (95%, 1-day)"
              value={metrics.var95 ? metrics.var95 * 100 : undefined}
              suffix="%"
              icon={Shield}
              color="text-purple-500"
            />
          </div>

          {/* Asset Class Breakdown */}
          <div>
            <h3 className="text-sm font-medium mb-3">Asset Class Breakdown</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Equity</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500"
                      style={{ width: `${equityWeight * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono w-12 text-right">
                    {(equityWeight * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Fixed Income</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${bondWeight * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono w-12 text-right">
                    {(bondWeight * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Other</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-500"
                      style={{ width: `${otherWeight * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono w-12 text-right">
                    {(otherWeight * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="mt-6 pt-6 border-t border-border/30">
        <h3 className="text-sm font-medium mb-3">Holdings</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {allocations.map(([asset, weight]) => (
            <div
              key={asset}
              className="flex items-center justify-between p-3 bg-surface-1 rounded-lg"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: assetColors[asset] || "#666" }}
                />
                <span className="font-medium">{asset}</span>
              </div>
              <span className="font-mono text-sm">{(weight * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value?: number;
  suffix?: string;
  icon: React.ElementType;
  color: string;
}

function MetricCard({ label, value, suffix = "", icon: Icon, color }: MetricCardProps) {
  return (
    <div className="p-4 bg-surface-1 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-semibold">
        {value !== undefined ? `${value.toFixed(2)}${suffix}` : "--"}
      </div>
    </div>
  );
}
