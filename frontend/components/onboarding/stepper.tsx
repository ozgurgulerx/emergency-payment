"use client";

import { LucideIcon, CheckCircle2, DollarSign, Percent, Calendar, Leaf, Ban, Globe, Target, TrendingUp, RefreshCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface Step {
  id: string;
  title: string;
  icon: LucideIcon;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PolicyData = Record<string, any>;

interface StepperProps {
  steps: Step[];
  currentStep: number;
  policy: PolicyData;
  onUpdatePolicy: (section: string, updates: PolicyData) => void;
}

export function Stepper({ steps, currentStep, policy, onUpdatePolicy }: StepperProps) {
  const step = steps[currentStep];

  return (
    <div className="space-y-6">
      {/* Step Indicators */}
      <div className="flex items-center justify-between mb-8 overflow-x-auto pb-2">
        {steps.map((s, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          return (
            <div key={s.id} className="flex items-center flex-shrink-0">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                    isCompleted && "bg-emerald-500 text-white",
                    isCurrent && "bg-amber-500 text-white ring-4 ring-amber-500/20",
                    !isCompleted && !isCurrent && "bg-surface-2 text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <s.icon className="w-5 h-5" />
                  )}
                </div>
                <span className={cn(
                  "text-xs mt-2 whitespace-nowrap",
                  isCurrent ? "text-amber-500 font-medium" : "text-muted-foreground"
                )}>
                  {s.title}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 w-6 md:w-12 mx-1 md:mx-2 mt-[-20px] transition-all",
                    isCompleted ? "bg-emerald-500" : "bg-border"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="bg-card border border-border/30 rounded-2xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <step.icon className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">{step.title}</h2>
              <p className="text-sm text-muted-foreground">{getStepDescription(step.id)}</p>
            </div>
          </div>

          {/* Step-specific forms */}
          {step.id === "profile" && (
            <ProfileStep policy={policy} onUpdate={onUpdatePolicy} />
          )}
          {step.id === "risk" && (
            <RiskStep policy={policy} onUpdate={onUpdatePolicy} />
          )}
          {step.id === "constraints" && (
            <ConstraintsStep policy={policy} onUpdate={onUpdatePolicy} />
          )}
          {step.id === "preferences" && (
            <PreferencesStep policy={policy} onUpdate={onUpdatePolicy} />
          )}
          {step.id === "benchmark" && (
            <BenchmarkStep policy={policy} onUpdate={onUpdatePolicy} />
          )}
          {step.id === "review" && <ReviewStep policy={policy} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function getStepDescription(stepId: string): string {
  const descriptions: Record<string, string> = {
    profile: "Tell us about yourself and your investment goals",
    risk: "Define your risk tolerance and time horizon",
    constraints: "Set allocation limits and position constraints",
    preferences: "Specify themes, ESG preferences, and exclusions",
    benchmark: "Choose your benchmark and rebalancing strategy",
    review: "Review your investment policy before launching",
  };
  return descriptions[stepId] || "";
}

// Step Components
function ProfileStep({ policy, onUpdate }: { policy: PolicyData; onUpdate: (section: string, updates: PolicyData) => void }) {
  const profile = policy.investor_profile;

  const investorTypes = [
    { value: "individual", label: "Individual", description: "Personal account" },
    { value: "institutional", label: "Institutional", description: "Fund or corporate" },
    { value: "family_office", label: "Family Office", description: "Multi-generational" },
    { value: "pension", label: "Pension Fund", description: "Retirement assets" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-3">Investor Type</label>
        <div className="grid grid-cols-2 gap-3">
          {investorTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => onUpdate("investor_profile", { investor_type: type.value })}
              className={cn(
                "p-4 rounded-xl border text-left transition-all",
                profile.investor_type === type.value
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-border hover:border-amber-500/50"
              )}
            >
              <span className="font-medium block">{type.label}</span>
              <span className="text-xs text-muted-foreground">{type.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          <DollarSign className="w-4 h-4 inline mr-1" />
          Portfolio Value
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
          <input
            type="number"
            value={profile.portfolio_value as number}
            onChange={(e) => onUpdate("investor_profile", { portfolio_value: Number(e.target.value) })}
            className="input-base pl-8"
            min={10000}
            step={10000}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Formatted: ${(profile.portfolio_value as number).toLocaleString()}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Base Currency</label>
        <select
          value={profile.base_currency as string}
          onChange={(e) => onUpdate("investor_profile", { base_currency: e.target.value })}
          className="input-base"
        >
          <option value="USD">USD - US Dollar</option>
          <option value="EUR">EUR - Euro</option>
          <option value="GBP">GBP - British Pound</option>
          <option value="JPY">JPY - Japanese Yen</option>
          <option value="CHF">CHF - Swiss Franc</option>
        </select>
      </div>
    </div>
  );
}

function RiskStep({ policy, onUpdate }: { policy: PolicyData; onUpdate: (section: string, updates: PolicyData) => void }) {
  const risk = policy.risk_appetite;

  const riskLevels = [
    { value: "conservative", label: "Conservative", color: "emerald" },
    { value: "moderate", label: "Moderate", color: "blue" },
    { value: "aggressive", label: "Aggressive", color: "amber" },
    { value: "very_aggressive", label: "Very Aggressive", color: "red" },
  ];

  const timeHorizons = [
    { value: "short", label: "Short", description: "< 3 years" },
    { value: "medium", label: "Medium", description: "3-7 years" },
    { value: "long", label: "Long", description: "7-15 years" },
    { value: "very_long", label: "Very Long", description: "15+ years" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-3">Risk Tolerance</label>
        <div className="grid grid-cols-2 gap-3">
          {riskLevels.map((level) => (
            <button
              key={level.value}
              onClick={() => onUpdate("risk_appetite", { risk_tolerance: level.value })}
              className={cn(
                "p-4 rounded-xl border text-left transition-all",
                risk.risk_tolerance === level.value
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-border hover:border-amber-500/50"
              )}
            >
              <span className="font-medium block capitalize">{level.label}</span>
              <div className="flex gap-1 mt-1">
                {[...Array(riskLevels.indexOf(level) + 1)].map((_, i) => (
                  <div key={i} className={`w-2 h-2 rounded-full bg-${level.color}-500`} />
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          <Percent className="w-4 h-4 inline mr-1" />
          Maximum Volatility (Annualized): {risk.max_volatility}%
        </label>
        <input
          type="range"
          min="5"
          max="40"
          value={risk.max_volatility as number}
          onChange={(e) => onUpdate("risk_appetite", { max_volatility: Number(e.target.value) })}
          className="w-full accent-amber-500"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>5% (Low)</span>
          <span>40% (High)</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          <TrendingUp className="w-4 h-4 inline mr-1" />
          Maximum Drawdown: {risk.max_drawdown}%
        </label>
        <input
          type="range"
          min="5"
          max="50"
          value={risk.max_drawdown as number}
          onChange={(e) => onUpdate("risk_appetite", { max_drawdown: Number(e.target.value) })}
          className="w-full accent-amber-500"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>5% (Conservative)</span>
          <span>50% (Aggressive)</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-3">
          <Calendar className="w-4 h-4 inline mr-1" />
          Investment Time Horizon
        </label>
        <div className="grid grid-cols-4 gap-2">
          {timeHorizons.map((h) => (
            <button
              key={h.value}
              onClick={() => onUpdate("risk_appetite", { time_horizon: h.value })}
              className={cn(
                "p-3 rounded-xl border text-center transition-all",
                risk.time_horizon === h.value
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-border hover:border-amber-500/50"
              )}
            >
              <span className="font-medium text-sm block">{h.label}</span>
              <span className="text-xs text-muted-foreground">{h.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConstraintsStep({ policy, onUpdate }: { policy: PolicyData; onUpdate: (section: string, updates: PolicyData) => void }) {
  const constraints = policy.constraints;

  return (
    <div className="space-y-6">
      {/* Equity Range */}
      <div className="p-4 rounded-xl bg-surface-2 border border-border/30">
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium">Equity Allocation</span>
          <span className="text-sm text-muted-foreground">
            {Math.round((constraints.min_equity as number) * 100)}% - {Math.round((constraints.max_equity as number) * 100)}%
          </span>
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Min</label>
            <input
              type="range"
              min="0"
              max="100"
              value={(constraints.min_equity as number) * 100}
              onChange={(e) => onUpdate("constraints", { min_equity: Number(e.target.value) / 100 })}
              className="w-full accent-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Max</label>
            <input
              type="range"
              min="0"
              max="100"
              value={(constraints.max_equity as number) * 100}
              onChange={(e) => onUpdate("constraints", { max_equity: Number(e.target.value) / 100 })}
              className="w-full accent-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Fixed Income Range */}
      <div className="p-4 rounded-xl bg-surface-2 border border-border/30">
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium">Fixed Income Allocation</span>
          <span className="text-sm text-muted-foreground">
            {Math.round((constraints.min_fixed_income as number) * 100)}% - {Math.round((constraints.max_fixed_income as number) * 100)}%
          </span>
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Min</label>
            <input
              type="range"
              min="0"
              max="100"
              value={(constraints.min_fixed_income as number) * 100}
              onChange={(e) => onUpdate("constraints", { min_fixed_income: Number(e.target.value) / 100 })}
              className="w-full accent-purple-500"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Max</label>
            <input
              type="range"
              min="0"
              max="100"
              value={(constraints.max_fixed_income as number) * 100}
              onChange={(e) => onUpdate("constraints", { max_fixed_income: Number(e.target.value) / 100 })}
              className="w-full accent-purple-500"
            />
          </div>
        </div>
      </div>

      {/* Position Limits */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Max Single Position</label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="2"
              max="25"
              value={(constraints.max_single_position as number) * 100}
              onChange={(e) => onUpdate("constraints", { max_single_position: Number(e.target.value) / 100 })}
              className="flex-1 accent-amber-500"
            />
            <span className="text-sm font-medium w-10 text-right">
              {Math.round((constraints.max_single_position as number) * 100)}%
            </span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Max Sector Exposure</label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="10"
              max="50"
              value={(constraints.max_sector_exposure as number) * 100}
              onChange={(e) => onUpdate("constraints", { max_sector_exposure: Number(e.target.value) / 100 })}
              className="flex-1 accent-amber-500"
            />
            <span className="text-sm font-medium w-10 text-right">
              {Math.round((constraints.max_sector_exposure as number) * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Min Positions */}
      <div>
        <label className="block text-sm font-medium mb-2">Minimum Number of Positions: {constraints.min_positions}</label>
        <input
          type="range"
          min="5"
          max="50"
          value={constraints.min_positions as number}
          onChange={(e) => onUpdate("constraints", { min_positions: Number(e.target.value) })}
          className="w-full accent-amber-500"
        />
      </div>
    </div>
  );
}

function PreferencesStep({ policy, onUpdate }: { policy: PolicyData; onUpdate: (section: string, updates: PolicyData) => void }) {
  const prefs = policy.preferences;
  const themes = ["Technology", "Healthcare", "Clean Energy", "AI & ML", "Fintech", "Value", "Growth", "Dividend"];
  const exclusions = ["Tobacco", "Weapons", "Gambling", "Fossil Fuels"];

  return (
    <div className="space-y-6">
      {/* ESG Focus */}
      <div className="p-4 rounded-xl bg-surface-2 border border-border/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Leaf className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <span className="font-medium block">ESG Focus</span>
              <span className="text-sm text-muted-foreground">Prioritize sustainable investments</span>
            </div>
          </div>
          <button
            onClick={() => onUpdate("preferences", { esg_focus: !prefs.esg_focus })}
            className={cn(
              "w-12 h-6 rounded-full transition-colors relative",
              prefs.esg_focus ? "bg-emerald-500" : "bg-surface-3"
            )}
          >
            <div
              className={cn(
                "w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform",
                prefs.esg_focus ? "translate-x-6" : "translate-x-0.5"
              )}
            />
          </button>
        </div>
      </div>

      {/* Investment Themes */}
      <div>
        <label className="block text-sm font-medium mb-3">Preferred Investment Themes</label>
        <div className="flex flex-wrap gap-2">
          {themes.map((theme) => {
            const selected = (prefs.preferred_themes as string[])?.includes(theme);
            return (
              <button
                key={theme}
                onClick={() => {
                  const current = (prefs.preferred_themes as string[]) || [];
                  const updated = selected
                    ? current.filter((t) => t !== theme)
                    : [...current, theme];
                  onUpdate("preferences", { preferred_themes: updated });
                }}
                className={cn(
                  "px-4 py-2 rounded-full text-sm transition-all",
                  selected
                    ? "bg-amber-500 text-white"
                    : "bg-surface-2 text-muted-foreground hover:bg-surface-3"
                )}
              >
                {theme}
              </button>
            );
          })}
        </div>
      </div>

      {/* Exclusions */}
      <div>
        <label className="block text-sm font-medium mb-3">
          <Ban className="w-4 h-4 inline mr-1" />
          Sector Exclusions
        </label>
        <div className="flex flex-wrap gap-2">
          {exclusions.map((exc) => {
            const selected = (prefs.exclusions as string[])?.includes(exc.toLowerCase());
            return (
              <button
                key={exc}
                onClick={() => {
                  const current = (prefs.exclusions as string[]) || [];
                  const value = exc.toLowerCase();
                  const updated = selected
                    ? current.filter((e) => e !== value)
                    : [...current, value];
                  onUpdate("preferences", { exclusions: updated });
                }}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all",
                  selected
                    ? "bg-red-500/10 border border-red-500/30 text-red-500"
                    : "bg-surface-2 border border-border hover:border-red-500/30"
                )}
              >
                <Ban className="w-3 h-3" />
                {exc}
              </button>
            );
          })}
        </div>
      </div>

      {/* Home Bias */}
      <div>
        <label className="block text-sm font-medium mb-2">
          <Globe className="w-4 h-4 inline mr-1" />
          Home Market Bias: {Math.round((prefs.home_bias as number) * 100)}%
        </label>
        <input
          type="range"
          min="20"
          max="100"
          value={(prefs.home_bias as number) * 100}
          onChange={(e) => onUpdate("preferences", { home_bias: Number(e.target.value) / 100 })}
          className="w-full accent-amber-500"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>Global Diversified</span>
          <span>Home-focused</span>
        </div>
      </div>
    </div>
  );
}

function BenchmarkStep({ policy, onUpdate }: { policy: PolicyData; onUpdate: (section: string, updates: PolicyData) => void }) {
  const benchmark = policy.benchmark_settings;

  const benchmarks = [
    { value: "SPY", label: "S&P 500", description: "US Large Cap" },
    { value: "QQQ", label: "Nasdaq 100", description: "US Tech" },
    { value: "VTI", label: "Total US Market", description: "All US Equities" },
    { value: "VT", label: "Total World", description: "Global Equities" },
    { value: "AGG", label: "US Aggregate Bond", description: "Fixed Income" },
  ];

  const frequencies = ["monthly", "quarterly", "semi_annually", "annually"];

  return (
    <div className="space-y-6">
      {/* Primary Benchmark */}
      <div>
        <label className="block text-sm font-medium mb-3">
          <Target className="w-4 h-4 inline mr-1" />
          Primary Benchmark
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {benchmarks.map((bm) => (
            <button
              key={bm.value}
              onClick={() => onUpdate("benchmark_settings", { benchmark: bm.value })}
              className={cn(
                "p-4 rounded-xl border text-left transition-all",
                benchmark.benchmark === bm.value
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-border hover:border-amber-500/50"
              )}
            >
              <span className="font-medium block">{bm.value}</span>
              <span className="text-xs text-muted-foreground">{bm.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Target Return */}
      <div>
        <label className="block text-sm font-medium mb-2">
          <TrendingUp className="w-4 h-4 inline mr-1" />
          Target Return (Annualized): {benchmark.target_return}%
        </label>
        <input
          type="range"
          min="3"
          max="20"
          step="0.5"
          value={benchmark.target_return as number}
          onChange={(e) => onUpdate("benchmark_settings", { target_return: Number(e.target.value) })}
          className="w-full accent-amber-500"
        />
      </div>

      {/* Rebalance Frequency */}
      <div>
        <label className="block text-sm font-medium mb-3">
          <RefreshCcw className="w-4 h-4 inline mr-1" />
          Rebalance Frequency
        </label>
        <div className="grid grid-cols-4 gap-2">
          {frequencies.map((freq) => (
            <button
              key={freq}
              onClick={() => onUpdate("benchmark_settings", { rebalance_frequency: freq })}
              className={cn(
                "p-3 rounded-xl border text-center transition-all",
                benchmark.rebalance_frequency === freq
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-border hover:border-amber-500/50"
              )}
            >
              <span className="font-medium text-sm capitalize">{freq.replace("_", " ")}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Rebalance Threshold */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Rebalance Threshold (Drift): {Math.round((benchmark.rebalance_threshold as number) * 100)}%
        </label>
        <input
          type="range"
          min="1"
          max="15"
          value={(benchmark.rebalance_threshold as number) * 100}
          onChange={(e) => onUpdate("benchmark_settings", { rebalance_threshold: Number(e.target.value) / 100 })}
          className="w-full accent-amber-500"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Rebalance when any position drifts more than this from target
        </p>
      </div>
    </div>
  );
}

function ReviewStep({ policy }: { policy: PolicyData }) {
  const profile = policy.investor_profile;
  const risk = policy.risk_appetite;
  const constraints = policy.constraints;
  const prefs = policy.preferences;
  const benchmark = policy.benchmark_settings;

  const sections = [
    {
      title: "Investor Profile",
      items: [
        { label: "Type", value: (profile.investor_type as string).replace("_", " ") },
        { label: "Portfolio", value: `$${(profile.portfolio_value as number).toLocaleString()}` },
        { label: "Currency", value: profile.base_currency as string },
      ],
    },
    {
      title: "Risk Appetite",
      items: [
        { label: "Tolerance", value: (risk.risk_tolerance as string).replace("_", " ") },
        { label: "Max Volatility", value: `${risk.max_volatility}%` },
        { label: "Max Drawdown", value: `${risk.max_drawdown}%` },
        { label: "Time Horizon", value: (risk.time_horizon as string).replace("_", " ") },
      ],
    },
    {
      title: "Constraints",
      items: [
        { label: "Equity Range", value: `${Math.round((constraints.min_equity as number) * 100)}-${Math.round((constraints.max_equity as number) * 100)}%` },
        { label: "Fixed Income", value: `${Math.round((constraints.min_fixed_income as number) * 100)}-${Math.round((constraints.max_fixed_income as number) * 100)}%` },
        { label: "Max Position", value: `${Math.round((constraints.max_single_position as number) * 100)}%` },
      ],
    },
    {
      title: "Benchmark",
      items: [
        { label: "Primary", value: benchmark.benchmark as string },
        { label: "Target Return", value: `${benchmark.target_return}%` },
        { label: "Rebalance", value: (benchmark.rebalance_frequency as string).replace("_", " ") },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
        <CheckCircle2 className="w-5 h-5" />
        <span className="text-sm font-medium">Your investment policy is ready to launch</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((section) => (
          <div key={section.title} className="p-4 rounded-xl bg-surface-2 border border-border/30">
            <h4 className="font-medium mb-3">{section.title}</h4>
            <div className="space-y-2">
              {section.items.map((item) => (
                <div key={item.label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-medium capitalize">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Preferences Summary */}
      <div className="p-4 rounded-xl bg-surface-2 border border-border/30">
        <h4 className="font-medium mb-3">Preferences</h4>
        <div className="flex flex-wrap gap-2">
          {prefs.esg_focus && (
            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">ESG Focus</Badge>
          )}
          {((prefs.preferred_themes as string[]) || []).map((theme: string) => (
            <Badge key={theme} className="bg-amber-500/10 text-amber-500 border-amber-500/20">{theme}</Badge>
          ))}
          {((prefs.exclusions as string[]) || []).map((exc: string) => (
            <Badge key={exc} className="bg-red-500/10 text-red-500 border-red-500/20 capitalize">No {exc}</Badge>
          ))}
          {(!prefs.esg_focus && !(prefs.preferred_themes as string[])?.length && !(prefs.exclusions as string[])?.length) && (
            <span className="text-sm text-muted-foreground">No specific preferences set</span>
          )}
        </div>
      </div>
    </div>
  );
}
