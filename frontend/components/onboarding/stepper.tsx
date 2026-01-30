"use client";

import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

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
      <div className="flex items-center justify-between mb-8">
        {steps.map((s, index) => (
          <div key={s.id} className="flex items-center">
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                index <= currentStep
                  ? "bg-amber-500 text-white"
                  : "bg-surface-2 text-muted-foreground"
              )}
            >
              <s.icon className="w-5 h-5" />
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-8 mx-2 transition-all",
                  index < currentStep ? "bg-amber-500" : "bg-surface-2"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <motion.div
        key={step.id}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="bg-card border border-border/50 rounded-xl p-6"
      >
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <step.icon className="w-5 h-5 text-amber-500" />
          {step.title}
        </h2>

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
    </div>
  );
}

// Step Components

function ProfileStep({ policy, onUpdate }: { policy: PolicyData; onUpdate: (section: string, updates: PolicyData) => void }) {
  const profile = policy.investor_profile;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Investor Type</label>
        <div className="grid grid-cols-2 gap-3">
          {["individual", "institutional"].map((type) => (
            <button
              key={type}
              onClick={() => onUpdate("investor_profile", { investor_type: type })}
              className={cn(
                "p-4 rounded-lg border text-left transition-all",
                profile.investor_type === type
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-border/50 hover:border-border"
              )}
            >
              <span className="capitalize font-medium">{type}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Portfolio Value</label>
        <input
          type="number"
          value={profile.portfolio_value as number}
          onChange={(e) => onUpdate("investor_profile", { portfolio_value: Number(e.target.value) })}
          className="w-full px-4 py-3 rounded-lg bg-surface-1 border border-border/50 focus:border-amber-500 focus:outline-none"
        />
        <p className="text-xs text-muted-foreground mt-1">
          ${(profile.portfolio_value as number).toLocaleString()}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Base Currency</label>
        <select
          value={profile.base_currency as string}
          onChange={(e) => onUpdate("investor_profile", { base_currency: e.target.value })}
          className="w-full px-4 py-3 rounded-lg bg-surface-1 border border-border/50 focus:border-amber-500 focus:outline-none"
        >
          <option value="USD">USD - US Dollar</option>
          <option value="EUR">EUR - Euro</option>
          <option value="GBP">GBP - British Pound</option>
          <option value="CHF">CHF - Swiss Franc</option>
        </select>
      </div>
    </div>
  );
}

function RiskStep({ policy, onUpdate }: { policy: PolicyData; onUpdate: (section: string, updates: PolicyData) => void }) {
  const risk = policy.risk_appetite;

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">Risk Tolerance</label>
        <div className="grid grid-cols-4 gap-2">
          {["conservative", "moderate", "aggressive", "very_aggressive"].map((level) => (
            <button
              key={level}
              onClick={() => onUpdate("risk_appetite", { risk_tolerance: level })}
              className={cn(
                "p-3 rounded-lg border text-center transition-all text-sm",
                risk.risk_tolerance === level
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-border/50 hover:border-border"
              )}
            >
              {level.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Maximum Volatility: {risk.max_volatility}%
        </label>
        <input
          type="range"
          min="5"
          max="30"
          value={risk.max_volatility as number}
          onChange={(e) => onUpdate("risk_appetite", { max_volatility: Number(e.target.value) })}
          className="w-full accent-amber-500"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>5% (Low)</span>
          <span>30% (High)</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Maximum Drawdown: {risk.max_drawdown}%
        </label>
        <input
          type="range"
          min="5"
          max="40"
          value={risk.max_drawdown as number}
          onChange={(e) => onUpdate("risk_appetite", { max_drawdown: Number(e.target.value) })}
          className="w-full accent-amber-500"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>5% (Conservative)</span>
          <span>40% (Aggressive)</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Time Horizon</label>
        <div className="grid grid-cols-4 gap-2">
          {[
            { value: "short", label: "< 3 years" },
            { value: "medium", label: "3-7 years" },
            { value: "long", label: "7-15 years" },
            { value: "very_long", label: "> 15 years" },
          ].map((h) => (
            <button
              key={h.value}
              onClick={() => onUpdate("risk_appetite", { time_horizon: h.value })}
              className={cn(
                "p-3 rounded-lg border text-center transition-all text-xs",
                risk.time_horizon === h.value
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-border/50 hover:border-border"
              )}
            >
              {h.label}
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
      <div>
        <label className="block text-sm font-medium mb-2">
          Equity Allocation: {Math.round((constraints.min_equity as number) * 100)}% - {Math.round((constraints.max_equity as number) * 100)}%
        </label>
        <div className="flex items-center gap-4">
          <span className="text-xs w-8">Min</span>
          <input
            type="range"
            min="0"
            max="100"
            value={(constraints.min_equity as number) * 100}
            onChange={(e) => onUpdate("constraints", { min_equity: Number(e.target.value) / 100 })}
            className="flex-1 accent-amber-500"
          />
          <span className="text-xs w-8">Max</span>
          <input
            type="range"
            min="0"
            max="100"
            value={(constraints.max_equity as number) * 100}
            onChange={(e) => onUpdate("constraints", { max_equity: Number(e.target.value) / 100 })}
            className="flex-1 accent-amber-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Fixed Income: {Math.round((constraints.min_fixed_income as number) * 100)}% - {Math.round((constraints.max_fixed_income as number) * 100)}%
        </label>
        <div className="flex items-center gap-4">
          <span className="text-xs w-8">Min</span>
          <input
            type="range"
            min="0"
            max="100"
            value={(constraints.min_fixed_income as number) * 100}
            onChange={(e) => onUpdate("constraints", { min_fixed_income: Number(e.target.value) / 100 })}
            className="flex-1 accent-blue-500"
          />
          <span className="text-xs w-8">Max</span>
          <input
            type="range"
            min="0"
            max="100"
            value={(constraints.max_fixed_income as number) * 100}
            onChange={(e) => onUpdate("constraints", { max_fixed_income: Number(e.target.value) / 100 })}
            className="flex-1 accent-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Max Single Position: {Math.round((constraints.max_single_position as number) * 100)}%
        </label>
        <input
          type="range"
          min="2"
          max="25"
          value={(constraints.max_single_position as number) * 100}
          onChange={(e) => onUpdate("constraints", { max_single_position: Number(e.target.value) / 100 })}
          className="w-full accent-amber-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Minimum Positions: {constraints.min_positions}
        </label>
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
  const themes = ["AI", "Technology", "CleanEnergy", "Healthcare", "Value", "Growth", "Dividend"];

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">ESG Screening</label>
        <button
          onClick={() => onUpdate("preferences", { esg_focus: !prefs.esg_focus })}
          className={cn(
            "w-full p-4 rounded-lg border text-left transition-all",
            prefs.esg_focus
              ? "border-green-500 bg-green-500/10"
              : "border-border/50 hover:border-border"
          )}
        >
          <span className="font-medium">
            {prefs.esg_focus ? "ESG Screening Enabled" : "Enable ESG Screening"}
          </span>
          <p className="text-xs text-muted-foreground mt-1">
            Exclude companies that don&apos;t meet ESG criteria
          </p>
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Investment Themes</label>
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
                  "px-4 py-2 rounded-full border text-sm transition-all",
                  selected
                    ? "border-amber-500 bg-amber-500/10 text-amber-500"
                    : "border-border/50 hover:border-border"
                )}
              >
                {theme}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
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
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Global</span>
          <span>Home-focused</span>
        </div>
      </div>
    </div>
  );
}

function BenchmarkStep({ policy, onUpdate }: { policy: PolicyData; onUpdate: (section: string, updates: PolicyData) => void }) {
  const benchmark = policy.benchmark_settings;
  const benchmarks = [
    { value: "SPY", label: "S&P 500 (SPY)" },
    { value: "QQQ", label: "Nasdaq 100 (QQQ)" },
    { value: "VTI", label: "Total US Market (VTI)" },
    { value: "AGG", label: "US Aggregate Bond (AGG)" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">Primary Benchmark</label>
        <div className="grid grid-cols-2 gap-3">
          {benchmarks.map((b) => (
            <button
              key={b.value}
              onClick={() => onUpdate("benchmark_settings", { benchmark: b.value })}
              className={cn(
                "p-4 rounded-lg border text-left transition-all",
                benchmark.benchmark === b.value
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-border/50 hover:border-border"
              )}
            >
              <span className="font-medium">{b.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Target Return: {benchmark.target_return}% annually
        </label>
        <input
          type="range"
          min="3"
          max="15"
          value={benchmark.target_return as number}
          onChange={(e) => onUpdate("benchmark_settings", { target_return: Number(e.target.value) })}
          className="w-full accent-amber-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Rebalance Frequency</label>
        <div className="grid grid-cols-4 gap-2">
          {["monthly", "quarterly", "semi_annually", "annually"].map((freq) => (
            <button
              key={freq}
              onClick={() => onUpdate("benchmark_settings", { rebalance_frequency: freq })}
              className={cn(
                "p-3 rounded-lg border text-center transition-all text-xs",
                benchmark.rebalance_frequency === freq
                  ? "border-amber-500 bg-amber-500/10"
                  : "border-border/50 hover:border-border"
              )}
            >
              {freq.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewStep({ policy }: { policy: PolicyData }) {
  const profile = policy.investor_profile;
  const risk = policy.risk_appetite;
  const constraints = policy.constraints;
  const prefs = policy.preferences;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground mb-4">
        Review your investment policy before launching the portfolio optimization.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-surface-1">
          <h4 className="font-medium text-sm mb-2">Profile</h4>
          <p className="text-xs text-muted-foreground">
            {(profile.investor_type as string).charAt(0).toUpperCase() + (profile.investor_type as string).slice(1)} investor
            <br />
            ${(profile.portfolio_value as number).toLocaleString()} portfolio
          </p>
        </div>

        <div className="p-4 rounded-lg bg-surface-1">
          <h4 className="font-medium text-sm mb-2">Risk</h4>
          <p className="text-xs text-muted-foreground">
            {(risk.risk_tolerance as string).replace("_", " ")} tolerance
            <br />
            Max {risk.max_volatility}% volatility, {risk.max_drawdown}% drawdown
          </p>
        </div>

        <div className="p-4 rounded-lg bg-surface-1">
          <h4 className="font-medium text-sm mb-2">Allocation</h4>
          <p className="text-xs text-muted-foreground">
            Equity: {Math.round((constraints.min_equity as number) * 100)}-{Math.round((constraints.max_equity as number) * 100)}%
            <br />
            Fixed Income: {Math.round((constraints.min_fixed_income as number) * 100)}-{Math.round((constraints.max_fixed_income as number) * 100)}%
          </p>
        </div>

        <div className="p-4 rounded-lg bg-surface-1">
          <h4 className="font-medium text-sm mb-2">Preferences</h4>
          <p className="text-xs text-muted-foreground">
            ESG: {prefs.esg_focus ? "Enabled" : "Disabled"}
            <br />
            Themes: {(prefs.preferred_themes as string[])?.length > 0 ? (prefs.preferred_themes as string[]).join(", ") : "None"}
          </p>
        </div>
      </div>

      <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <p className="text-sm">
          Ready to launch! The orchestrator will assign tasks to specialized agents
          and construct your optimal portfolio in real-time.
        </p>
      </div>
    </div>
  );
}
