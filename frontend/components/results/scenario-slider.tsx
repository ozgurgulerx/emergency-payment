"use client";

import { useState } from "react";
import { PortfolioAllocation } from "@/store/orchestrator-store";
import { motion } from "framer-motion";
import { TrendingDown, TrendingUp, DollarSign, Percent } from "lucide-react";

interface ScenarioSliderProps {
  portfolio: PortfolioAllocation;
}

const scenarios = [
  { id: "base", name: "Base Case", equity: 0, bonds: 0, description: "Current market expectations" },
  { id: "bull", name: "Bull Market", equity: 0.15, bonds: 0.02, description: "Strong economic growth" },
  { id: "bear", name: "Bear Market", equity: -0.25, bonds: 0.05, description: "Recession scenario" },
  { id: "rates_up", name: "Rates Up", equity: -0.08, bonds: -0.12, description: "Rising interest rates" },
  { id: "inflation", name: "High Inflation", equity: -0.05, bonds: -0.08, description: "Inflation shock" },
];

export function ScenarioSlider({ portfolio }: ScenarioSliderProps) {
  const [selectedScenario, setSelectedScenario] = useState("base");

  const allocations = Object.entries(portfolio.allocations);
  const equityAssets = ["VTI", "VOO", "SPY", "VEA", "VXUS", "VWO", "QQQ", "IWM"];
  const bondAssets = ["BND", "BNDX", "AGG", "VCSH", "LQD"];

  const equityWeight = allocations
    .filter(([asset]) => equityAssets.includes(asset))
    .reduce((sum, [_, w]) => sum + w, 0);
  const bondWeight = allocations
    .filter(([asset]) => bondAssets.includes(asset))
    .reduce((sum, [_, w]) => sum + w, 0);

  const scenario = scenarios.find((s) => s.id === selectedScenario) || scenarios[0];

  // Calculate scenario impact
  const equityImpact = equityWeight * scenario.equity;
  const bondImpact = bondWeight * scenario.bonds;
  const totalImpact = equityImpact + bondImpact;

  // Assume $1M portfolio
  const portfolioValue = 1_000_000;
  const dollarImpact = totalImpact * portfolioValue;

  return (
    <div className="bg-card border border-border/30 rounded-xl p-6">
      <h2 className="text-xl font-semibold mb-6">Scenario Analysis</h2>

      {/* Scenario Selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {scenarios.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedScenario(s.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedScenario === s.id
                ? "bg-amber-500 text-white"
                : "bg-surface-1 hover:bg-surface-2"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Scenario Details */}
      <div className="p-4 bg-surface-1 rounded-lg mb-6">
        <h3 className="font-medium mb-1">{scenario.name}</h3>
        <p className="text-sm text-muted-foreground">{scenario.description}</p>
        <div className="mt-3 flex gap-4 text-xs">
          <span>Equity: {scenario.equity > 0 ? "+" : ""}{(scenario.equity * 100).toFixed(0)}%</span>
          <span>Bonds: {scenario.bonds > 0 ? "+" : ""}{(scenario.bonds * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Impact Visualization */}
      <div className="grid grid-cols-3 gap-4">
        <motion.div
          key={`equity-${selectedScenario}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-lg ${
            equityImpact >= 0 ? "bg-green-500/10" : "bg-red-500/10"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            {equityImpact >= 0 ? (
              <TrendingUp className="w-4 h-4 text-green-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-500" />
            )}
            <span className="text-xs text-muted-foreground">Equity Impact</span>
          </div>
          <div className={`text-xl font-semibold ${
            equityImpact >= 0 ? "text-green-500" : "text-red-500"
          }`}>
            {equityImpact >= 0 ? "+" : ""}{(equityImpact * 100).toFixed(1)}%
          </div>
        </motion.div>

        <motion.div
          key={`bonds-${selectedScenario}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`p-4 rounded-lg ${
            bondImpact >= 0 ? "bg-green-500/10" : "bg-red-500/10"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            {bondImpact >= 0 ? (
              <TrendingUp className="w-4 h-4 text-green-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-500" />
            )}
            <span className="text-xs text-muted-foreground">Bond Impact</span>
          </div>
          <div className={`text-xl font-semibold ${
            bondImpact >= 0 ? "text-green-500" : "text-red-500"
          }`}>
            {bondImpact >= 0 ? "+" : ""}{(bondImpact * 100).toFixed(1)}%
          </div>
        </motion.div>

        <motion.div
          key={`total-${selectedScenario}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`p-4 rounded-lg ${
            totalImpact >= 0 ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className={`w-4 h-4 ${
              totalImpact >= 0 ? "text-green-500" : "text-red-500"
            }`} />
            <span className="text-xs text-muted-foreground">Total Impact</span>
          </div>
          <div className={`text-xl font-semibold ${
            totalImpact >= 0 ? "text-green-500" : "text-red-500"
          }`}>
            {dollarImpact >= 0 ? "+" : ""}${Math.abs(dollarImpact).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div className={`text-xs ${
            totalImpact >= 0 ? "text-green-400" : "text-red-400"
          }`}>
            {totalImpact >= 0 ? "+" : ""}{(totalImpact * 100).toFixed(1)}%
          </div>
        </motion.div>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Based on $1M portfolio. Scenario impacts are estimates based on historical correlations.
      </p>
    </div>
  );
}
