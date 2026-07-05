import { useState } from "react";
import { useT } from "../store/useStore";
import { api } from "../lib/api";
import { Button } from "./ui";
import { haptics } from "../lib/telegram";

const REASONS = ["fake", "offensive", "spam", "other"];

/**
 * Combined Report + Block sheet. Report stores a reason (+ optional note).
 * Block hides the user from discovery and prevents messaging both ways.
 */
export function ReportBlockModal({
  targetUserId,
  onClose,
  onDone,
}: {
  targetUserId: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const t = useT();
  const [reason, setReason] = useState<string>("fake");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const submitReport = async () => {
    setBusy(true);
    try {
      await api.report(targetUserId, reason, note.trim() || undefined);
      haptics.notify("success");
      setDone(t("report.success"));
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const doBlock = async () => {
    if (!confirm(t("block.confirm"))) return;
    setBusy(true);
    try {
      await api.block(targetUserId);
      haptics.notify("success");
      onDone?.();
      onClose();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl bg-[var(--tg-secondary-bg-color)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold text-tg">{t("report.title")}</h2>

        {done ? (
          <p className="py-4 text-center text-tg">{done}</p>
        ) : (
          <>
            <div className="mb-4 space-y-2">
              {REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left ${
                    reason === r ? "bg-brand text-white" : "bg-[var(--tg-bg-color)] text-tg"
                  }`}
                >
                  <span>{t(`report.reason.${r}`)}</span>
                  {reason === r && <span>✓</span>}
                </button>
              ))}
            </div>
            <textarea
              className="mb-4 w-full rounded-xl bg-[var(--tg-bg-color)] px-4 py-3 text-tg outline-none placeholder:text-tg-hint"
              rows={2}
              placeholder={t("report.noteLabel")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="space-y-3">
              <Button onClick={submitReport} disabled={busy}>
                {t("report.title")}
              </Button>
              <button
                onClick={doBlock}
                disabled={busy}
                className="w-full rounded-2xl bg-pass/20 py-3.5 font-semibold text-pass"
              >
                {t("chat.block")}
              </button>
              <button onClick={onClose} className="w-full py-2 text-tg-hint">
                {t("common.cancel")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
