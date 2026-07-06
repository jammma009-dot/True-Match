/**
 * Occasional "shooting stars" that streak across the sky from lower-left to
 * upper-right (45°) and fade out — a subtle galaxy/starfall vibe behind the
 * whole app, like Telegram's animated backgrounds. Pure CSS; sits at z-index -1
 * so app content (cards, screens) renders on top.
 */
const STARS = [
  { top: "78%", left: "8%", delay: "0s", duration: "9s" },
  { top: "62%", left: "30%", delay: "3.4s", duration: "11s" },
  { top: "88%", left: "52%", delay: "6.1s", duration: "10s" },
  { top: "70%", left: "70%", delay: "8.7s", duration: "12s" },
  { top: "50%", left: "18%", delay: "12.5s", duration: "10.5s" },
  { top: "40%", left: "60%", delay: "15.2s", duration: "13s" },
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
