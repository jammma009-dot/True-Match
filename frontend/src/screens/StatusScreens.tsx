import { useQueryClient } from "@tanstack/react-query";
import { X, Heart, Gift, Hourglass, Ban } from "lucide-react";
import { useStore, useT } from "../store/useStore";
import { BottomNav } from "../components/BottomNav";
import { Button } from "../components/ui";

/**
 * Dimmed swipe action buttons shown behind the pending/rejected overlay for
 * visual continuity (non-functional in these states).
 */
function DimmedActions() {
  return (
    <div className="pointer-events-none flex justify-center gap-5 py-4 opacity-25">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-pass">
        <X className="h-7 w-7" strokeWidth={3} />
      </div>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-amber-400">
        <Gift className="h-5 w-5" />
      </div>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-like text-white">
        <Heart className="h-7 w-7" fill="currentColor" />
      </div>
    </div>
  );
}

/** Profile under review — feed locked. Bottom nav visible but dimmed. */
export function PendingScreen() {
  const t = useT();
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-brand/30 to-brand/5">
          <Hourglass className="h-11 w-11 animate-pulse text-brand" />
        </div>
        <h1 className="mb-3 text-2xl font-bold text-tg">{t("pending.title")}</h1>
        <p className="max-w-sm text-tg-hint">{t("pending.body")}</p>
      </div>
      <DimmedActions />
      <BottomNav active="discover" onChange={() => {}} disabled />
    </div>
  );
}

/** Profile rejected — show reason (if any) and let the user re-submit. */
export function RejectedScreen() {
  const t = useT();
  const me = useStore((s) => s.me);
  const queryClient = useQueryClient();
  const reason = me?.profile?.rejectionReason;

  const retry = () => {
    // Clear the profile locally so the app routes back to onboarding.
    if (me) {
      useStore.getState().setMe({ ...me, profile: null });
    }
    queryClient.invalidateQueries({ queryKey: ["me"] });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-pass/10">
          <Ban className="h-11 w-11 text-pass" />
        </div>
        <h1 className="mb-3 text-2xl font-bold text-tg">{t("rejected.title")}</h1>
        <p className="mb-2 text-tg-hint">{t("rejected.body")}</p>
        {reason && (
          <p className="mb-6 text-tg">
            <span className="text-tg-hint">{t("rejected.reason")} </span>
            {reason}
          </p>
        )}
        <div className="mt-4 w-full max-w-xs">
          <Button onClick={retry}>{t("rejected.retry")}</Button>
        </div>
      </div>
      <DimmedActions />
      <BottomNav active="discover" onChange={() => {}} disabled />
    </div>
  );
}
