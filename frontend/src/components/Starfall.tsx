/**
 * Occasional "shooting stars" that streak across the sky from lower-left to
 * upper-right (45°) and fade out — a subtle galaxy/starfall vibe behind the
 * whole app, like Telegram's animated backgrounds. Pure CSS; sits at z-index -1
 * so app content (cards, screens) renders on top.
 */
const STARS = [
  { top: "82%", left: "10%", delay: "1s", duration: "22s" },
  { top: "64%", left: "34%", delay: "9s", duration: "26s" },
  { top: "74%", left: "62%", delay: "17s", duration: "24s" },
  { top: "52%", left: "22%", delay: "27s", duration: "28s" },
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
