"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

export function CopyInvite({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url =
      typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "group flex w-full items-center justify-between gap-3 rounded-md border border-dashed border-[--color-border] bg-[--color-surface-2]/60 px-3 py-2.5 text-left transition-colors",
        "hover:border-[--color-accent]/60 hover:bg-[--color-surface-2]"
      )}
    >
      <span className="truncate font-mono text-xs text-[--color-muted] group-hover:text-[--color-text]">
        {path}
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs transition-colors",
          copied ? "text-[--color-accent]" : "text-[--color-faint] group-hover:text-[--color-text]"
        )}
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
