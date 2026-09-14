import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  // Poppy/Avocado only ever carry bold text at this size — white-on-Poppy is
  // 3.98:1 and white-on-Avocado is 4.49:1, both AA for large/bold text only
  // (verified against the WCAG formula), never AA for regular body text.
  primary: "bg-poppy text-white font-bold hover:brightness-95",
  secondary: "bg-avocado text-white font-bold hover:brightness-95",
  outline: "border-2 border-cocoa text-cocoa font-semibold hover:bg-cocoa/5",
  ghost: "text-cocoa font-semibold underline underline-offset-2 hover:opacity-70",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** The one place button sizing/contrast rules live, so they can't drift apart across pages. */
export default function Button({ variant = "outline", className = "", ...props }: ButtonProps) {
  const base =
    variant === "ghost"
      ? "inline-flex items-center justify-center min-h-11 px-1 text-base disabled:opacity-50"
      : "inline-flex items-center justify-center min-h-11 rounded-full px-5 text-base disabled:opacity-50";
  return <button className={`${base} ${VARIANT_CLASSES[variant]} ${className}`} {...props} />;
}
