import { useRef, useState } from "react";
import { X, Camera, ShieldCheck } from "lucide-react";
import { useT } from "../store/useStore";
import { api, uploadToR2 } from "../lib/api";
import { haptics } from "../lib/telegram";

/**
 * Verification sheet: shows how to take the selfie (illustrated example holding
 * two fingers), opens the camera, uploads the selfie and submits it for review.
 */
export function VerificationModal({
  onDone,
  onClose,
}: {
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(false);
    setUploading(true);
    try {
      const { key, uploadUrl, publicUrl } = await api.presignPhoto(file.type);
      await uploadToR2(uploadUrl, file);
      await api.submitVerification(key, publicUrl);
      haptics.notify("success");
      onDone();
    } catch {
      haptics.notify("error");
      setError(true);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-[var(--tg-secondary-bg-color)] p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <button onClick={onClose} className="absolute right-5 text-tg-hint active:opacity-70" aria-label="close">
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/15 text-sky-400">
            <ShieldCheck className="h-7 w-7" />
          </span>
          <h2 className="mt-3 text-xl font-extrabold text-tg">{t("verify.title")}</h2>
          <p className="mt-1 max-w-xs text-sm text-tg-hint">{t("verify.subtitle")}</p>
        </div>

        {/* Illustrated example: face + two fingers */}
        <div className="mx-auto mt-5 w-40">
          <SelfieExample />
          <p className="mt-2 text-center text-xs text-tg-hint">{t("verify.example")}</p>
        </div>

        <p className="mx-auto mt-5 max-w-xs rounded-2xl bg-[var(--tg-bg-color)] px-4 py-3 text-center text-xs leading-relaxed text-tg-hint">
          {t("verify.note")}
        </p>

        {error && <p className="mt-3 text-center text-xs text-pass">{t("common.error")}</p>}

        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 py-4 font-bold text-white active:opacity-90 disabled:opacity-60"
        >
          <Camera className="h-5 w-5" />
          {uploading ? t("verify.uploading") : t("verify.take")}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={onFile}
        />
      </div>
    </div>
  );
}

/** Simple illustration of a person holding up two fingers (the required pose). */
function SelfieExample() {
  return (
    <svg viewBox="0 0 200 210" className="w-full" aria-hidden="true">
      {/* phone / photo frame */}
      <rect x="6" y="6" width="188" height="198" rx="22" fill="#0f172a" stroke="#334155" strokeWidth="3" />
      {/* shoulders */}
      <path d="M40 200 C40 158 70 140 100 140 C130 140 160 158 160 200 Z" fill="#38bdf8" opacity="0.35" />
      {/* head */}
      <circle cx="92" cy="96" r="34" fill="#f2c9a0" />
      {/* hair */}
      <path d="M58 92 C58 66 126 66 126 92 C126 80 112 68 92 68 C72 68 58 78 58 92 Z" fill="#3b2a20" />
      {/* eyes */}
      <circle cx="82" cy="94" r="3.4" fill="#1f2937" />
      <circle cx="102" cy="94" r="3.4" fill="#1f2937" />
      {/* smile */}
      <path d="M82 108 Q92 116 102 108" stroke="#1f2937" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* hand — palm */}
      <rect x="132" y="96" width="30" height="34" rx="12" fill="#f2c9a0" />
      {/* two fingers up */}
      <rect x="136" y="58" width="9" height="46" rx="4.5" fill="#f2c9a0" />
      <rect x="149" y="58" width="9" height="46" rx="4.5" fill="#f2c9a0" />
      {/* thumb */}
      <rect x="128" y="104" width="9" height="20" rx="4.5" fill="#f2c9a0" transform="rotate(-25 132 114)" />
    </svg>
  );
}
