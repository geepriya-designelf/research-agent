import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "border-line bg-canvas text-muted-ink",
        accent: "border-accent/20 bg-accent-soft text-accent",
        evidence: "border-evidence/25 bg-evidence-soft text-evidence",
        caution: "border-caution/30 bg-caution-soft text-caution",
        alarm: "border-alarm/25 bg-alarm-soft text-alarm",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
