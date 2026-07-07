import { useEffect, useRef, useState } from "react";
import { X, Camera, ShieldCheck, Aperture } from "lucide-react";
import { useT } from "../store/useStore";
import { api, uploadToR2 } from "../lib/api";
import { haptics } from "../lib/telegram";

/**
 * Verification sheet. Shows the example pose, then opens a LIVE in-app camera
 * (getUserMedia) with a capture button — not a gallery/file picker. Captures a
 * frame, uploads it, and submits for review. Falls back to the native
 * camera-capture input only if the webview blocks camera access.
 */
export function VerificationModal({
  onDone,
  onClose,
}: {
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<"intro" | "camera">("intro");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => () => stopCamera(), []);

  // Attach the live stream to the <video> once we're in camera phase.
  useEffect(() => {
    if (phase === "camera" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => undefined);
    }
  }, [phase]);

  const openCamera = async () => {
    setError(null);
    haptics.impact("light");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setPhase("camera");
    } catch {
      // Camera unavailable / denied → fall back to native camera input.
      fileRef.current?.click();
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const { key, uploadUrl, publicUrl } = await api.presignPhoto(file.type || "image/jpeg");
      await uploadToR2(uploadUrl, file);
      await api.submitVerification(key, publicUrl);
      haptics.notify("success");
      stopCamera();
      onDone();
    } catch {
      haptics.notify("error");
      setError(t("common.error"));
      setUploading(false);
    }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    haptics.impact("medium");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        upload(new File([blob], "verification.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) upload(file);
  };

  const close = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/70" onClick={close}>
      <div
        className="max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-[var(--tg-secondary-bg-color)] p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <button onClick={close} className="absolute right-5 text-tg-hint active:opacity-70" aria-label="close">
          <X className="h-5 w-5" />
        </button>

        {phase === "intro" ? (
          <>
            <div className="flex flex-col items-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-500/15 text-sky-400">
                <ShieldCheck className="h-7 w-7" />
              </span>
              <h2 className="mt-3 text-xl font-extrabold text-tg">{t("verify.title")}</h2>
              <p className="mt-1 max-w-xs text-sm text-tg-hint">{t("verify.subtitle")}</p>
            </div>

            <div className="mx-auto mt-5 w-44">
              <SelfieExample />
              <p className="mt-2 text-center text-xs text-tg-hint">{t("verify.example")}</p>
            </div>

            <p className="mx-auto mt-5 max-w-xs rounded-2xl bg-[var(--tg-bg-color)] px-4 py-3 text-center text-xs leading-relaxed text-tg-hint">
              {t("verify.note")}
            </p>

            {error && <p className="mt-3 text-center text-xs text-pass">{error}</p>}

            <button
              type="button"
              disabled={uploading}
              onClick={openCamera}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 py-4 font-bold text-white active:opacity-90 disabled:opacity-60"
            >
              <Camera className="h-5 w-5" />
              {uploading ? t("verify.uploading") : t("verify.open")}
            </button>
          </>
        ) : (
          <>
            <h2 className="mb-3 text-center text-lg font-bold text-tg">{t("verify.camTitle")}</h2>
            {/* Live camera preview (mirrored like a selfie) */}
            <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="h-full w-full -scale-x-100 object-cover"
              />
            </div>

            {error && <p className="mt-3 text-center text-xs text-pass">{error}</p>}

            <button
              type="button"
              disabled={uploading}
              onClick={capture}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 py-4 font-bold text-white active:opacity-90 disabled:opacity-60"
            >
              <Aperture className="h-5 w-5" />
              {uploading ? t("verify.uploading") : t("verify.capture")}
            </button>
          </>
        )}

        {/* Fallback native camera input (used only if getUserMedia is blocked) */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={onFilePicked}
        />
      </div>
    </div>
  );
}

/** Real example photo (person holding up two fingers); illustration fallback. */
function SelfieExample() {
  const [failed, setFailed] = useState(false);
  if (!failed) {
    return (
      <img
        src="/verify-example.jpg"
        alt="example"
        className="w-full rounded-2xl border border-white/10 object-cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <svg viewBox="0 0 200 210" className="w-full" aria-hidden="true">
      <rect x="6" y="6" width="188" height="198" rx="22" fill="#0f172a" stroke="#334155" strokeWidth="3" />
      <path d="M40 200 C40 158 70 140 100 140 C130 140 160 158 160 200 Z" fill="#38bdf8" opacity="0.35" />
      <circle cx="92" cy="96" r="34" fill="#f2c9a0" />
      <path d="M58 92 C58 66 126 66 126 92 C126 80 112 68 92 68 C72 68 58 78 58 92 Z" fill="#3b2a20" />
      <circle cx="82" cy="94" r="3.4" fill="#1f2937" />
      <circle cx="102" cy="94" r="3.4" fill="#1f2937" />
      <path d="M82 108 Q92 116 102 108" stroke="#1f2937" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="132" y="96" width="30" height="34" rx="12" fill="#f2c9a0" />
      <rect x="136" y="58" width="9" height="46" rx="4.5" fill="#f2c9a0" />
      <rect x="149" y="58" width="9" height="46" rx="4.5" fill="#f2c9a0" />
      <rect x="128" y="104" width="9" height="20" rx="4.5" fill="#f2c9a0" transform="rotate(-25 132 114)" />
    </svg>
  );
}
