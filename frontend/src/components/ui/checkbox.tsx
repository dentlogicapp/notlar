"use client";
import * as P from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

export const Checkbox = forwardRef<
  React.ElementRef<typeof P.Root>,
  React.ComponentPropsWithoutRef<typeof P.Root>
>(({ className, ...props }, ref) => (
  <P.Root
    ref={ref}
    className={cn(
      "h-6 w-6 shrink-0 rounded-md border-2 border-clay-300 bg-white dark:bg-ink-850",
      "data-[state=checked]:bg-terracotta data-[state=checked]:border-terracotta",
      "data-[state=checked]:text-white",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/40",
      "transition-colors cursor-pointer",
      className
    )}
    {...props}
  >
    <P.Indicator className="flex items-center justify-center text-current">
      <Check className="h-4 w-4" strokeWidth={3} />
    </P.Indicator>
  </P.Root>
));
Checkbox.displayName = "Checkbox";
