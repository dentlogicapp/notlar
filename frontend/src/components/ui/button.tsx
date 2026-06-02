"use client";
import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const base = "inline-flex items-center justify-center font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/40 disabled:opacity-40 disabled:pointer-events-none rounded-xl select-none";
    const v = {
      primary: "bg-clay-800 text-cream-50 hover:bg-clay-700 active:translate-y-px shadow-sm",
      secondary: "bg-terracotta text-white hover:bg-terracotta-dark active:translate-y-px shadow-sm",
      ghost: "text-clay-600 dark:text-ink-100 hover:text-clay-900 dark:hover:text-ink-50 hover:bg-cream-200 dark:hover:bg-ink-800",
      danger: "text-clay-400 dark:text-ink-300 hover:text-red-700 hover:bg-rose-50",
      outline: "border border-clay-200 text-clay-800 dark:text-ink-50 hover:bg-cream-200 dark:hover:bg-ink-800",
    };
    const s = { sm: "h-9 px-3 text-sm", md: "h-11 px-5 text-sm", lg: "h-12 px-6 text-base" };
    return <button ref={ref} className={cn(base, v[variant], s[size], className)} {...props} />;
  }
);
Button.displayName = "Button";
