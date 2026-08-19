import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  info: "border-accent/20 bg-accent-soft text-ink",
  caution: "border-caution/30 bg-caution-soft text-ink",
  alarm: "border-alarm/25 bg-alarm-soft text-ink",
  evidence: "border-evidence/25 bg-evidence-soft text-ink",
} as const;

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", tones[tone], className)}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div className="text-muted-ink [&_strong]:text-ink">{children}</div>
    </div>
  );
}
