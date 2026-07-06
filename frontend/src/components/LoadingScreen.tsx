/**
 * Full-screen branded loading state: the True Match logo centered with a soft
 * pulsing glow, expanding "radar" rings, and bouncing dots around it.
 */
export function LoadingScreen() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-black">
      {/* Expanding rings */}
      <span className="loading-ring" />
      <span className="loading-ring" style={{ animationDelay: "1.3s" }} />

      {/* Logo */}
      <img
        src="/logo.png"
        alt="True Match"
        draggable={false}
        className="animate-logoPulse relative z-10 w-72 max-w-[78%] object-contain"
      />

      {/* Bouncing dots */}
      <div className="relative z-10 mt-6 flex gap-2">
        <span className="loading-dot" />
        <span className="loading-dot" style={{ animationDelay: "0.15s" }} />
        <span className="loading-dot" style={{ animationDelay: "0.3s" }} />
      </div>
    </div>
  );
}
