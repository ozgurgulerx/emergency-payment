"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Code, Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PolicyPreviewProps {
  policy: Record<string, unknown>;
}

export function PolicyPreview({ policy }: PolicyPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(policy, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-border/30 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-surface-1 hover:bg-surface-2 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Policy JSON Preview</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-surface-1 border-t border-border/30 relative">
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-2 rounded-lg bg-surface-2 hover:bg-surface-1 transition-colors"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
              <pre className="text-xs font-mono overflow-x-auto max-h-[300px] pr-10">
                {JSON.stringify(policy, null, 2)}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
