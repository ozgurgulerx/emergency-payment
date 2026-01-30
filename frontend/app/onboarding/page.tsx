"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  TrendingUp,
  Shield,
  Sliders,
  Target,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Send,
  Bot,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/onboarding/stepper";
import { ChatPanel } from "@/components/onboarding/chat-panel";
import { PolicyPreview } from "@/components/onboarding/policy-preview";

// Default policy structure
const defaultPolicy = {
  investor_profile: {
    investor_type: "individual",
    base_currency: "USD",
    portfolio_value: 1000000,
  },
  risk_appetite: {
    risk_tolerance: "moderate",
    max_volatility: 15,
    max_drawdown: 20,
    time_horizon: "medium",
    liquidity_needs: 0.1,
  },
  constraints: {
    min_equity: 0.3,
    max_equity: 0.7,
    min_fixed_income: 0.2,
    max_fixed_income: 0.6,
    min_cash: 0.02,
    max_cash: 0.2,
    max_single_position: 0.1,
    max_sector_exposure: 0.25,
    min_positions: 10,
  },
  preferences: {
    esg_focus: false,
    exclusions: [],
    preferred_themes: [],
    factor_tilts: {},
    home_bias: 0.6,
  },
  benchmark_settings: {
    benchmark: "SPY",
    target_return: 7,
    rebalance_frequency: "quarterly",
    rebalance_threshold: 0.05,
  },
};

const steps = [
  { id: "profile", title: "Investor Profile", icon: User },
  { id: "risk", title: "Risk Appetite", icon: TrendingUp },
  { id: "constraints", title: "Constraints", icon: Shield },
  { id: "preferences", title: "Preferences", icon: Sliders },
  { id: "benchmark", title: "Benchmark", icon: Target },
  { id: "review", title: "Review & Launch", icon: CheckCircle2 },
];

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const chatMode = searchParams.get("mode") === "chat";

  const [currentStep, setCurrentStep] = useState(0);
  const [policy, setPolicy] = useState(defaultPolicy);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showChat, setShowChat] = useState(true); // Show chat by default

  const updatePolicy = (section: string, updates: Record<string, unknown>) => {
    setPolicy((prev) => ({
      ...prev,
      [section]: { ...prev[section as keyof typeof prev], ...updates },
    }));
  };

  const handleChatUpdate = (updatedPolicy: unknown) => {
    setPolicy(updatedPolicy as typeof policy);
  };

  const handleLaunch = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/ic/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });

      if (response.ok) {
        const data = await response.json();
        // Store policy in sessionStorage so Mission Control can access it
        sessionStorage.setItem(`policy-${data.run_id}`, JSON.stringify(policy));
        router.push(`/runs/${data.run_id}`);
      } else {
        console.error("Failed to start run");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <span className="font-semibold">Portfolio Setup</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowChat(!showChat)}
          >
            {showChat ? "Hide Chat" : "Show Chat"}
          </Button>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="border-b border-border/30">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              Step {currentStep + 1} of {steps.length}
            </span>
            <span className="text-sm font-medium">{steps[currentStep].title}</span>
          </div>
          <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-amber-500"
              initial={{ width: 0 }}
              animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className={`grid ${showChat ? "grid-cols-1 lg:grid-cols-2 gap-8" : "grid-cols-1 max-w-3xl mx-auto"}`}>
          {/* Stepper Panel */}
          <div className="space-y-6">
            <Stepper
              steps={steps}
              currentStep={currentStep}
              policy={policy}
              onUpdatePolicy={updatePolicy}
            />

            {/* Navigation */}
            <div className="flex justify-between pt-6 border-t border-border/30">
              <Button
                variant="outline"
                onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                disabled={currentStep === 0}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Previous
              </Button>

              {currentStep < steps.length - 1 ? (
                <Button
                  onClick={() => setCurrentStep(currentStep + 1)}
                  className="bg-amber-500 hover:bg-amber-600"
                >
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={handleLaunch}
                  disabled={isSubmitting}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                >
                  {isSubmitting ? (
                    <>
                      <span className="animate-pulse">Launching...</span>
                    </>
                  ) : (
                    <>
                      Launch Portfolio Optimization
                      <Sparkles className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Chat Panel */}
          <AnimatePresence>
            {showChat && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="lg:border-l border-border/30 lg:pl-8"
              >
                <ChatPanel
                  policy={policy}
                  onPolicyUpdate={handleChatUpdate}
                  onStepChange={setCurrentStep}
                  onLaunch={handleLaunch}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Policy Preview (collapsible) */}
        <div className="mt-8">
          <PolicyPreview policy={policy} />
        </div>
      </main>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}
