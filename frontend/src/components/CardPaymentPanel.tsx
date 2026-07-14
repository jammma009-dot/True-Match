import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  CreditCard,
  Loader2,
  Clock,
} from "lucide-react";
import { useT } from "../store/useStore";
import { api, CardOrder } from "../lib/api";
import { haptics } from "../lib/telegram";

type Phase = "creating" | "waiting" | "paid" | "expired" | "error";

/** Group the integer part with thin spaces: "1000.17" → "1 000.17". */
function prettyAmount(amount: string): string {
  const [intPart, dec] = amount.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return dec ? `${grouped}.${dec}` : grouped;
}

/** mm:ss from seconds. */
function mmss(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Copy text to clipboard with a webview-safe fallback. */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    /* fall through to legacy method */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch {
    /* ignore */
  }
}

/**
 * In-modal panel for the automated card-to-card flow. Creates an order (card
 * number + EXACT amount with a unique tiyin suffix), then polls until the
 * CardXabar userbot reports the transfer and the backend activates the
 * entitlement.
 */
export function CardPaymentPanel({
  createOrder,
  onPaid,
  onBack,
}: {
  createOrder: () => Promise<CardOrder>;
  onPaid?: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const [order, setOrder] = useState<CardOrder | null>(null);
  const [phase, setPhase] = useState<Phase>("creating");
  const [copied, setCopied] = useState<"amount" | "card" | null>(null);
  const [remaining, setRemaining] = useState(0);
  const paidFired = useRef(false);

  const start = useCallback(async () => {
    setPhase("creating");
    try {
      const o = await createOrder();
      setOrder(o);
      setPhase("waiting");
    } catch {
      setPhase("error");
    }
  }, [createOrder]);

  useEffect(() => {
    void start();
  }, [start]);

  // Countdown + status polling while waiting.
  useEffect(() => {
    if (phase !== "waiting" || !order) return;
    const expires = new Date(order.expiresAt).getTime();

    const tick = () => {
      const secs = Math.max(0, Math.floor((expires - Date.now()) / 1000));
      setRemaining(secs);
      if (secs <= 0) setPhase("expired");
    };
    tick();
    const tickId = window.setInterval(tick, 1000);

    const pollId = window.setInterval(async () => {
      try {
        const s = await api.getCardOrder(order.orderId);
        if (s.status === "paid") {
          setPhase("paid");
        } else if (s.status === "expired" || s.status === "cancelled") {
          setPhase("expired");
        }
      } catch {
        /* transient — keep polling */
      }
    }, 4000);

    return () => {
      window.clearInterval(tickId);
      window.clearInterval(pollId);
    };
  }, [phase, order]);

  // Fire onPaid exactly once when payment is confirmed.
  useEffect(() => {
    if (phase === "paid" && !paidFired.current) {
      paidFired.current = true;
      haptics.notify("success");
      onPaid?.();
    }
  }, [phase, onPaid]);

  const doCopy = async (text: string, which: "amount" | "card") => {
    await copyText(text);
    haptics.impact("light");
    setCopied(which);
    window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
  };

  // ----- Paid -----
  if (phase === "paid") {
    return (
      <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl bg-emerald-500/15 py-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/25 text-emerald-300">
          <Check className="h-7 w-7" />
        </span>
        <p className="text-base font-bold text-emerald-300">{t("card.paid")}</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 flex items-center gap-1 text-sm text-tg-hint active:opacity-70"
      >
        <ArrowLeft className="h-4 w-4" /> {t("common.back")}
      </button>

      {phase === "creating" && (
        <div className="flex flex-col items-center gap-3 py-10 text-tg-hint">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">{t("card.creating")}</p>
        </div>
      )}

      {phase === "error" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-sm text-pass">{t("card.error")}</p>
          <button
            type="button"
            onClick={() => void start()}
            className="rounded-2xl bg-brand px-5 py-2.5 font-semibold text-white active:opacity-90"
          >
            {t("card.retry")}
          </button>
        </div>
      )}

      {phase === "expired" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-sm text-pass">{t("card.expired")}</p>
          <button
            type="button"
            onClick={() => void start()}
            className="rounded-2xl bg-brand px-5 py-2.5 font-semibold text-white active:opacity-90"
          >
            {t("card.retry")}
          </button>
        </div>
      )}

      {phase === "waiting" && order && (
        <div className="space-y-3">
          <p className="text-sm text-tg-hint">{t("card.instructions")}</p>

          {/* Amount — the most important field (unique tiyin suffix). */}
          <div className="rounded-2xl border border-brand/40 bg-brand/10 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-brand">
              {t("card.amount")}
            </p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-2xl font-extrabold text-tg">
                {prettyAmount(order.amount)}{" "}
                <span className="text-sm font-semibold text-tg-hint">
                  {t("card.som")}
                </span>
              </span>
              <button
                type="button"
                onClick={() => doCopy(order.amount, "amount")}
                className="flex items-center gap-1 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white active:opacity-90"
              >
                {copied === "amount" ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> {t("card.copied")}
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> {t("card.copy")}
                  </>
                )}
              </button>
            </div>
            <p className="mt-2 text-xs text-amber-300">{t("card.exactWarning")}</p>
          </div>

          {/* Card number */}
          <div className="rounded-2xl bg-[var(--tg-bg-color)] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-tg-hint">
              {t("card.number")}
            </p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-lg font-bold tracking-wide text-tg">
                <CreditCard className="h-5 w-5 text-brand" />
                {order.cardNumber}
              </span>
              <button
                type="button"
                onClick={() => doCopy(order.cardNumber, "card")}
                className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-tg active:opacity-80"
              >
                {copied === "card" ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> {t("card.copied")}
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> {t("card.copy")}
                  </>
                )}
              </button>
            </div>
            {order.cardHolder && (
              <p className="mt-2 text-sm text-tg-hint">
                {t("card.holder")}: <span className="text-tg">{order.cardHolder}</span>
              </p>
            )}
          </div>

          {/* Waiting + countdown */}
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-[var(--tg-bg-color)] py-3 text-sm text-tg-hint">
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
            <span>{t("card.waiting")}</span>
            {remaining > 0 && (
              <span className="ml-1 flex items-center gap-1 text-xs">
                <Clock className="h-3.5 w-3.5" /> {mmss(remaining)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
