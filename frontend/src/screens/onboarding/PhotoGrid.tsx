import { useRef, useState } from "react";
import { useT } from "../../store/useStore";
import { api, uploadToR2 } from "../../lib/api";
import { haptics } from "../../lib/telegram";

export interface UploadedPhoto {
  key: string;
  url: string;
}

const MAX_PHOTOS = 6;

/**
 * Photo upload grid — up to 6 slots, 3 per row. Each selected photo is
 * uploaded DIRECTLY to R2 via a presigned URL, then stored as { key, url }.
 */
export function PhotoGrid({
  photos,
  onChange,
}: {
  photos: UploadedPhoto[];
  onChange: (photos: UploadedPhoto[]) => void;
}) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFile = () => {
    if (photos.length >= MAX_PHOTOS || uploading) return;
    fileInputRef.current?.click();
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;

    setError(null);
    setUploading(true);
    try {
      const { key, uploadUrl, publicUrl } = await api.presignPhoto(file.type);
      await uploadToR2(uploadUrl, file);
      haptics.impact("light");
      onChange([...photos, { key, url: publicUrl }]);
    } catch {
      setError(t("common.error"));
    } finally {
      setUploading(false);
    }
  };

  const removeAt = (idx: number) => {
    haptics.impact("light");
    onChange(photos.filter((_, i) => i !== idx));
  };

  // Build fixed slot layout.
  const slots = Array.from({ length: MAX_PHOTOS }).map((_, i) => photos[i] ?? null);

  return (
    <div>
      <div className="mb-2 text-sm text-tg-hint">
        {t("onboarding.photos.counter", { count: photos.length })}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {slots.map((photo, i) => {
          if (photo) {
            return (
              <div
                key={i}
                className="relative aspect-[3/4] overflow-hidden rounded-xl bg-[var(--tg-secondary-bg-color)]"
              >
                <img
                  src={photo.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <button
                  onClick={() => removeAt(i)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
                >
                  ✕
                </button>
              </div>
            );
          }
          const isNextSlot = i === photos.length;
          return (
            <button
              key={i}
              onClick={pickFile}
              disabled={!isNextSlot}
              className="flex aspect-[3/4] items-center justify-center rounded-xl border-2 border-dashed border-[var(--tg-hint-color)]/40 text-3xl text-tg-hint disabled:opacity-30"
            >
              {isNextSlot && uploading ? (
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              ) : (
                "+"
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-tg-hint">{t("onboarding.photos.helper")}</p>
      {error && <p className="mt-2 text-sm text-pass">{error}</p>}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onFileSelected}
      />
    </div>
  );
}
