/**
 * Loading screen: the original logo (with its own dark background) on #050608,
 * softly pulsing, with a sleek indeterminate progress bar underneath.
 */
export function LoadingScreen() {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center"
      style={{ backgroundColor: "#050608" }}
    >
      <img
        src="/logo.png"
        alt="True Match"
        draggable={false}
        className="animate-logoPulse w-60 max-w-[70%] rounded-[28px] object-contain"
      />

      {/* Sleek indeterminate progress bar */}
      <div className="mt-9 h-1 w-40 overflow-hidden rounded-full bg-white/10">
        <span className="loading-bar" />
      </div>
    </div>
  );
}
