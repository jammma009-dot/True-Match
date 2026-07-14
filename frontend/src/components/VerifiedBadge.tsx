import { Check } from "lucide-react";

/** Blue verification check-mark badge, shown next to a verified user's name. */
export function VerifiedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-sky-500 align-middle shadow ${className}`}
      title="Verified"
    >
      <Check className="h-3 w-3 text-white" strokeWidth={3.5} />
    </span>
  );
}
