"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Bot,
  User,
  Sparkles,
  Shield,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Scan,
  Lock,
  Fingerprint,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PiiApiResponse } from "@/types/pii";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  updates?: string[];
}

interface ChatPanelProps {
  policy: Record<string, unknown>;
  onPolicyUpdate: (policy: unknown) => void;
  onStepChange: (step: number) => void;
  onLaunch?: () => void;
}

type PiiStatus = "idle" | "checking" | "passed" | "blocked";

// Format PII category for display
function formatCategory(category: string): string {
  const categoryMap: Record<string, string> = {
    Person: "Name",
    PersonType: "Personal Info",
    PhoneNumber: "Phone",
    Email: "Email",
    Address: "Address",
    USBankAccountNumber: "Bank Account",
    CreditCardNumber: "Credit Card",
    USSocialSecurityNumber: "SSN",
    USDriversLicenseNumber: "Driver's License",
    USPassportNumber: "Passport",
    USIndividualTaxpayerIdentification: "Tax ID",
    InternationalBankingAccountNumber: "IBAN",
    SWIFTCode: "SWIFT",
    IPAddress: "IP Address",
  };
  return categoryMap[category] || category;
}

// Policy summary component to avoid TypeScript issues with unknown types
function PolicySummaryContent({ policy }: { policy: Record<string, unknown> }) {
  const p = policy as {
    risk_appetite?: { risk_tolerance?: string; time_horizon?: string };
    investor_profile?: { portfolio_value?: number };
    preferences?: { esg_focus?: boolean; preferred_themes?: string[]; exclusions?: string[] };
  };

  return (
    <div className="space-y-2 text-xs">
      {p.risk_appetite?.risk_tolerance && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Risk Tolerance</span>
          <span className="font-medium capitalize">{p.risk_appetite.risk_tolerance}</span>
        </div>
      )}
      {p.investor_profile?.portfolio_value && p.investor_profile.portfolio_value > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Portfolio Value</span>
          <span className="font-medium">${p.investor_profile.portfolio_value.toLocaleString()}</span>
        </div>
      )}
      {p.risk_appetite?.time_horizon && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Time Horizon</span>
          <span className="font-medium capitalize">{p.risk_appetite.time_horizon}</span>
        </div>
      )}
      {p.preferences?.esg_focus && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">ESG Focus</span>
          <span className="font-medium text-emerald-400">Enabled</span>
        </div>
      )}
      {p.preferences?.preferred_themes && p.preferences.preferred_themes.length > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Themes</span>
          <span className="font-medium">{p.preferences.preferred_themes.join(", ")}</span>
        </div>
      )}
      {p.preferences?.exclusions && p.preferences.exclusions.length > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Exclusions</span>
          <span className="font-medium text-red-400">{p.preferences.exclusions.join(", ")}</span>
        </div>
      )}
    </div>
  );
}

export function ChatPanel({ policy, onPolicyUpdate, onLaunch }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi! I'm your portfolio advisor. Tell me about your investment goals, risk tolerance, and how much you're looking to invest. I'll help configure your portfolio as we chat.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [piiStatus, setPiiStatus] = useState<PiiStatus>("idle");
  const [piiError, setPiiError] = useState<string | null>(null);
  const [detectedCategories, setDetectedCategories] = useState<string[]>([]);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [showPassedBanner, setShowPassedBanner] = useState(false);
  const [readyToLaunch, setReadyToLaunch] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [showContextSummary, setShowContextSummary] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);
  const bannerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const passedTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Reset PII status when input changes (only if blocked)
  useEffect(() => {
    if (piiStatus === "blocked" && input !== blockedMessage) {
      setPiiStatus("idle");
      setPiiError(null);
      setDetectedCategories([]);
    }
  }, [input, piiStatus, blockedMessage]);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
      if (passedTimeoutRef.current) clearTimeout(passedTimeoutRef.current);
    };
  }, []);

  const checkPii = async (text: string): Promise<PiiApiResponse> => {
    try {
      const response = await fetch("/api/pii", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      return await response.json();
    } catch (error) {
      console.error("PII check failed:", error);
      return { blocked: false, message: null, warning: "PII check unavailable" };
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || piiStatus === "checking") return;

    const messageText = input.trim();

    // Clear any existing timeouts
    if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
    if (passedTimeoutRef.current) clearTimeout(passedTimeoutRef.current);

    // Start PII check
    setPiiStatus("checking");
    setPiiError(null);
    setDetectedCategories([]);

    // Announce to screen readers
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = "Scanning message for personal information...";
    }

    const piiResult = await checkPii(messageText);

    if (piiResult.blocked) {
      setPiiStatus("blocked");
      setPiiError(piiResult.message || "Personal information detected");
      setDetectedCategories(piiResult.detectedCategories || []);
      setBlockedMessage(messageText);

      // Announce to screen readers
      if (liveRegionRef.current) {
        liveRegionRef.current.textContent = `Message blocked. Personal information detected: ${(piiResult.detectedCategories || []).map(formatCategory).join(", ")}`;
      }
      return;
    }

    // PII check passed
    setPiiStatus("passed");
    setShowPassedBanner(true);

    // Announce to screen readers
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = "Security check passed. No personal information detected.";
    }

    // Hide banner after 2 seconds
    bannerTimeoutRef.current = setTimeout(() => {
      setShowPassedBanner(false);
    }, 2000);

    // Return to idle after 3 seconds
    passedTimeoutRef.current = setTimeout(() => {
      setPiiStatus("idle");
    }, 3000);

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageText,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setBlockedMessage(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/ic/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          current_policy: policy,
        }),
      });

      const data = await response.json();

      // Defense in depth: Backend also checks for PII
      if (data.blocked || data.error === "pii_detected") {
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
        setPiiStatus("blocked");
        setPiiError(data.message || "Message contains sensitive information");
        setDetectedCategories(data.detectedCategories || []);
        setBlockedMessage(messageText);
        setInput(messageText);
        return;
      }

      if (response.ok && data.response) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.response,
          updates: data.updates,
        };

        setMessages((prev) => [...prev, assistantMessage]);

        if (data.policy) {
          onPolicyUpdate(data.policy);
        }

        // Update readiness state
        setReadyToLaunch(data.readyToLaunch || false);
        setMissingFields(data.missingFields || []);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: "I understand. Let me help you configure that in the policy settings.",
          },
        ]);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "I'm having trouble connecting. Please use the form on the left to configure your policy.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreMessage = () => {
    if (blockedMessage) {
      setInput(blockedMessage);
      setPiiStatus("idle");
      setPiiError(null);
      setDetectedCategories([]);
      inputRef.current?.focus();
    }
  };

  const suggestions = [
    "I have $2M, moderate risk, 10 year horizon",
    "Conservative investor, $500k, retiring soon",
    "$1M portfolio, aggressive growth, long term",
    "Exclude tobacco, focus on clean energy",
  ];

  // Get input field classes based on status
  const getInputClasses = () => {
    const base = "w-full px-4 py-3 rounded-xl bg-surface-1 focus:outline-none text-sm disabled:opacity-50 transition-all";
    switch (piiStatus) {
      case "checking":
        return `${base} border-2 border-amber-500/60 bg-amber-500/5`;
      case "passed":
        return `${base} border-2 border-emerald-500/60 bg-emerald-500/5`;
      case "blocked":
        return `${base} border-2 border-red-500/60 bg-red-500/5`;
      default:
        return `${base} border border-border/50 focus:border-amber-500`;
    }
  };

  return (
    <div className="h-[600px] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Portfolio Advisor</h3>
          <p className="text-xs text-muted-foreground">Tell me your goals</p>
        </div>

        {/* PII Status Badge */}
        <AnimatePresence mode="wait">
          {piiStatus === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-500"
            >
              <Shield className="h-3.5 w-3.5" />
              <span>PII Protected</span>
            </motion.div>
          )}

          {piiStatus === "checking" && (
            <motion.div
              key="checking"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Scan className="h-3.5 w-3.5" />
              </motion.div>
              <span>Scanning...</span>
            </motion.div>
          )}

          {piiStatus === "passed" && (
            <motion.div
              key="passed"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500"
            >
              <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ duration: 0.3 }}>
                <ShieldCheck className="h-3.5 w-3.5" />
              </motion.div>
              <span>Secure</span>
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: "spring" }}>
                <CheckCircle2 className="h-3.5 w-3.5" />
              </motion.div>
            </motion.div>
          )}

          {piiStatus === "blocked" && (
            <motion.div
              key="blocked"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-500"
            >
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.5, repeat: Infinity }}>
                <ShieldX className="h-3.5 w-3.5" />
              </motion.div>
              <span>Blocked</span>
              <XCircle className="h-3.5 w-3.5" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Success Banner */}
      <AnimatePresence>
        {showPassedBanner && (
          <motion.div
            initial={{ opacity: 0, y: -30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="mb-4 relative z-40"
          >
            <div className="flex items-center justify-center gap-3 p-3 rounded-xl bg-gradient-to-r from-emerald-500/20 via-emerald-500/25 to-emerald-500/20 border-2 border-emerald-500/50 shadow-lg shadow-emerald-500/20">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
              >
                <div className="bg-emerald-500 rounded-full p-2">
                  <ShieldCheck className="h-5 w-5 text-white" />
                </div>
              </motion.div>
              <div className="flex flex-col">
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 }}
                  className="text-emerald-400 font-semibold text-sm"
                >
                  Security Check Passed
                </motion.span>
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-emerald-400/80 text-xs"
                >
                  No personal information detected
                </motion.span>
              </div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.2, 1] }}
                transition={{ delay: 0.25, duration: 0.3 }}
              >
                <Lock className="h-4 w-4 text-emerald-500" />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Banner */}
      <AnimatePresence>
        {piiStatus === "blocked" && piiError && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="mb-4 relative z-40"
          >
            <motion.div
              className="p-4 rounded-xl bg-gradient-to-r from-red-500/15 via-red-500/20 to-red-500/15 border-2 border-red-500/50 shadow-lg shadow-red-500/20"
              animate={{ x: [0, -8, 8, -8, 8, 0] }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div className="flex items-start gap-3">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 15 }}
                >
                  <div className="bg-red-500 rounded-full p-2 mt-0.5">
                    <ShieldX className="h-5 w-5 text-white" />
                  </div>
                </motion.div>

                <div className="flex-1 min-w-0">
                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
                    <h4 className="text-red-400 font-bold text-base flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Message Blocked - PII Detected
                    </h4>
                  </motion.div>

                  <motion.p
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-red-400/90 text-sm mt-1"
                  >
                    {piiError}
                  </motion.p>

                  {detectedCategories.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="flex flex-wrap gap-2 mt-3"
                    >
                      {detectedCategories.map((category, idx) => (
                        <motion.span
                          key={category}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.35 + idx * 0.1 }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-medium"
                        >
                          <Fingerprint className="h-3 w-3" />
                          {formatCategory(category)}
                        </motion.span>
                      ))}
                    </motion.div>
                  )}

                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    onClick={handleRestoreMessage}
                    className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors border border-slate-600"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore message to edit
                  </motion.button>
                </div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 }}
                  className="flex-shrink-0 self-start"
                >
                  <motion.div
                    className="relative"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <div className="absolute inset-0 bg-red-500 rounded-full blur-md opacity-40" />
                    <motion.div
                      className="relative bg-red-500 rounded-full p-2"
                      animate={{
                        boxShadow: [
                          "0 0 0 0 rgba(239, 68, 68, 0)",
                          "0 0 0 8px rgba(239, 68, 68, 0.3)",
                          "0 0 0 0 rgba(239, 68, 68, 0)"
                        ]
                      }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <AlertTriangle className="h-5 w-5 text-white" />
                    </motion.div>
                  </motion.div>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  message.role === "user"
                    ? "bg-amber-500"
                    : "bg-gradient-to-br from-blue-500 to-indigo-500"
                }`}
              >
                {message.role === "user" ? (
                  <User className="w-4 h-4 text-white" />
                ) : (
                  <Bot className="w-4 h-4 text-white" />
                )}
              </div>
              <div
                className={`max-w-[80%] p-3 rounded-xl text-sm ${
                  message.role === "user"
                    ? "bg-amber-500 text-white"
                    : "bg-surface-2"
                }`}
              >
                {message.content}
                {message.updates && message.updates.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/20">
                    <div className="flex items-center gap-1 text-xs opacity-75 mb-1">
                      <Sparkles className="w-3 h-3" />
                      Policy Updated:
                    </div>
                    {message.updates.map((update, i) => (
                      <div key={i} className="text-xs opacity-90">
                        - {update}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-surface-2 p-3 rounded-xl">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:100ms]" />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:200ms]" />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Ready to Launch Banner */}
      <AnimatePresence>
        {readyToLaunch && !showContextSummary && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="py-3 border-t border-border/30"
          >
            <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/15 to-emerald-500/10 border border-emerald-500/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-sm font-medium text-emerald-400">Policy Complete</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowContextSummary(true)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-surface-2 hover:bg-surface-1 transition-colors"
                  >
                    Review
                  </button>
                  <button
                    onClick={onLaunch}
                    className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-colors flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    Launch
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context Summary */}
      <AnimatePresence>
        {showContextSummary && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="py-3 border-t border-border/30 overflow-hidden"
          >
            <div className="p-4 rounded-xl bg-surface-2 border border-border/30">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-500" />
                  Policy Summary
                </h4>
                <button
                  onClick={() => setShowContextSummary(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Hide
                </button>
              </div>
              <PolicySummaryContent policy={policy} />
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setShowContextSummary(false)}
                  className="flex-1 text-xs px-3 py-2 rounded-lg bg-surface-1 hover:bg-surface-2 transition-colors"
                >
                  Continue Editing
                </button>
                <button
                  onClick={onLaunch}
                  className="flex-1 text-xs px-3 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-medium transition-colors flex items-center justify-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  Launch Portfolio
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suggestions */}
      {messages.length <= 2 && piiStatus === "idle" && !readyToLaunch && (
        <div className="py-3 border-t border-border/30">
          <p className="text-xs text-muted-foreground mb-2">Try saying:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setInput(suggestion)}
                className="text-xs px-3 py-1.5 rounded-full bg-surface-2 hover:bg-surface-1 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="pt-4 border-t border-border/30">
        <div className="flex gap-2 relative">
          <div className="flex-1 relative">
            {/* Scanning Overlay */}
            <AnimatePresence>
              {piiStatus === "checking" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-30 pointer-events-none rounded-xl overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-amber-500/10 to-amber-500/5" />
                  <motion.div
                    className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent"
                    initial={{ top: 0 }}
                    animate={{ top: ["0%", "100%", "0%"] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <motion.div
                    className="absolute inset-0 border-2 border-amber-500/50 rounded-xl"
                    animate={{
                      borderColor: ["rgba(245, 158, 11, 0.3)", "rgba(245, 158, 11, 0.7)", "rgba(245, 158, 11, 0.3)"],
                    }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Passed Overlay */}
            <AnimatePresence>
              {piiStatus === "passed" && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 0.5] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="absolute inset-0 z-30 pointer-events-none rounded-xl overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 via-emerald-500/30 to-emerald-500/20" />
                    <motion.div
                      className="absolute inset-0 border-2 border-emerald-500 rounded-xl"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 1, 0.6] }}
                      transition={{ duration: 0.4 }}
                    />
                  </motion.div>
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                    className="absolute top-1 right-1 z-40"
                  >
                    <div className="bg-emerald-500 rounded-full p-1 shadow-lg shadow-emerald-500/50">
                      <CheckCircle2 className="h-3 w-3 text-white" />
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            {/* Blocked Overlay */}
            <AnimatePresence>
              {piiStatus === "blocked" && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-30 pointer-events-none rounded-xl overflow-hidden"
                  >
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-red-500/15 via-red-500/25 to-red-500/15"
                      animate={{ opacity: [0.5, 1, 0.7] }}
                      transition={{ duration: 0.3 }}
                    />
                    <motion.div
                      className="absolute inset-0 border-2 border-red-500 rounded-xl"
                      animate={{
                        boxShadow: [
                          "0 0 0 0 rgba(239, 68, 68, 0)",
                          "0 0 30px 5px rgba(239, 68, 68, 0.4)",
                          "0 0 15px 2px rgba(239, 68, 68, 0.3)"
                        ]
                      }}
                      transition={{ duration: 0.5 }}
                    />
                  </motion.div>
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                    className="absolute top-1 right-1 z-40"
                  >
                    <motion.div
                      className="bg-red-500 rounded-full p-1 shadow-lg shadow-red-500/50"
                      animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
                      transition={{ duration: 0.5, delay: 0.2 }}
                    >
                      <XCircle className="h-3 w-3 text-white" />
                    </motion.div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Tell me about your investment goals..."
              disabled={piiStatus === "checking"}
              className={getInputClasses()}
            />
          </div>

          {/* Submit Button */}
          <AnimatePresence mode="wait">
            {piiStatus === "idle" && (
              <motion.div key="idle-btn" initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}>
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  <Send className="h-5 w-5 text-white" />
                </Button>
              </motion.div>
            )}

            {piiStatus === "checking" && (
              <motion.div key="checking-btn" initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}>
                <Button className="bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-500/30">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                    <Scan className="h-5 w-5 text-white" />
                  </motion.div>
                </Button>
              </motion.div>
            )}

            {piiStatus === "passed" && (
              <motion.div key="passed-btn" initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}>
                <Button className="bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/30">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  >
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  </motion.div>
                </Button>
              </motion.div>
            )}

            {piiStatus === "blocked" && (
              <motion.div
                key="blocked-btn"
                initial={{ scale: 0.9 }}
                animate={{ scale: 1, x: [0, -5, 5, -5, 5, 0] }}
                exit={{ scale: 0.9 }}
                transition={{ duration: 0.4 }}
              >
                <Button className="bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30">
                  <motion.div animate={{ rotate: [0, -15, 15, -15, 15, 0] }} transition={{ duration: 0.5 }}>
                    <XCircle className="h-5 w-5 text-white" />
                  </motion.div>
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Screen reader announcements */}
      <div
        ref={liveRegionRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
    </div>
  );
}
