import { Crown } from "lucide-react";

/**
 * Animated golden Premium badge shown next to a premium user's name.
 * `variant="icon"` renders a compact crown chip (for cards);
 * `variant="label"` adds the word "PRO".
 */
export function PremiumBadge({
  variant = "icon",
  className = "",
}: {
  variant?: "icon" | "label";
  className?: string;
}) {
  return (
    <span
      className={`premium-badge inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 align-middle ${className}`}
    >
      <Crown className="h-3 w-3" fill="currentColor" strokeWidth={2} />
      {variant === "label" && (
        <span className="text-[9px] font-extrabold uppercase tracking-wider">PRO</span>
      )}
    </span>
  );
}
