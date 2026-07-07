/**
 * Fancy branded loading screen: the logo inside a round badge with a spinning
 * pink→purple glow halo, expanding radar rings, a gentle float, and bouncing
 * dots — all on the logo's own dark background (#050608).
 */
export function LoadingScreen() {
  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
      style={{ backgroundColor: "#050608" }}
    >
      {/* Expanding radar rings */}
      <span className="loading-ring" />
      <span className="loading-ring" style={{ animationDelay: "1.3s" }} />

      {/* Round logo badge with rotating glow */}
      <div className="animate-logoFloat relative z-10 h-44 w-44">
        <span className="loading-halo" />
        <div className="loading-badge">
          <img
            src="/logo-mark.png"
            alt="True Match"
            draggable={false}
            className="h-full w-full object-contain p-7"
          />
        </div>
      </div>

      {/* Bouncing dots */}
      <div className="relative z-10 mt-9 flex gap-2">
        <span className="loading-dot" />
        <span className="loading-dot" style={{ animationDelay: "0.15s" }} />
        <span className="loading-dot" style={{ animationDelay: "0.3s" }} />
      </div>
    </div>
  );
}
