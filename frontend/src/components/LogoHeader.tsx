/** Centered True Match wordmark, used as a header on non-profile screens. */
export function LogoHeader() {
  return (
    <div className="flex flex-shrink-0 items-center justify-center pb-2 pt-3">
      <img
        src="/logo-wordmark.png"
        alt="True Match"
        draggable={false}
        className="h-8 w-auto object-contain"
      />
    </div>
  );
}
