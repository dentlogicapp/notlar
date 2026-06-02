"use client";
import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-clay-200 bg-white dark:bg-ink-850 px-4 text-[15px] text-clay-900 dark:text-ink-50",
        "placeholder:text-clay-400 dark:placeholder:text-ink-300",
        "focus:outline-none focus:border-clay-400 focus:ring-2 focus:ring-clay-900/5",
        "transition-colors",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-xl border border-clay-200 bg-white dark:bg-ink-850 px-4 py-3 text-[15px] text-clay-900 dark:text-ink-50",
        "placeholder:text-clay-400 dark:placeholder:text-ink-300 resize-y min-h-[88px]",
        "focus:outline-none focus:border-clay-400 focus:ring-2 focus:ring-clay-900/5",
        "transition-colors",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export const Label = ({ htmlFor, children, className }: { htmlFor?: string; children: React.ReactNode; className?: string }) => (
  <label htmlFor={htmlFor} className={cn("block text-sm font-medium text-clay-700 dark:text-ink-100 mb-1.5", className)}>
    {children}
  </label>
);
