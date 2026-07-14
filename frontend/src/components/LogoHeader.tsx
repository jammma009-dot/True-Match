/** Centered True Match wordmark — same size on every page that shows it. */
export function LogoHeader() {
  return (
    <div className="flex flex-shrink-0 items-center justify-center pb-0.5 pt-0.5">
      <img
        src="/logo-wordmark.png"
        alt="True Match"
        draggable={false}
        className="h-9 w-auto object-contain"
      />
    </div>
  );
}
