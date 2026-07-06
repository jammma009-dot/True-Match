/**
 * Occasional "shooting stars" that streak across the sky from lower-left to
 * upper-right (45°) and fade out — a subtle galaxy/starfall vibe behind the
 * whole app, like Telegram's animated backgrounds. Pure CSS; sits at z-index -1
 * so app content (cards, screens) renders on top.
 */
// Start points are OFF-SCREEN (bottom/left) so each star is only ever seen
// while crossing the visible area, then exits off-screen — never a visible
// start/stop. Varied starts make them cross different parts of the screen.
const STARS = [
  { top: "85%", left: "-20%", delay: "2s", duration: "22s" },
  { top: "118%", left: "18%", delay: "10s", duration: "27s" },
  { top: "118%", left: "52%", delay: "19s", duration: "24s" },
  { top: "55%", left: "-20%", delay: "30s", duration: "29s" },
];

export function Starfall() {
  return (
    <div className="starfall" aria-hidden="true">
      {STARS.map((s, i) => (
        <span
          key={i}
          className="shooting-star"
          style={{
            top: s.top,
            left: s.left,
            animationDelay: s.delay,
            animationDuration: s.duration,
          }}
        />
      ))}
    </div>
  );
}
