/**
 * Parallax star background — three depth layers of star dots (built as CSS
 * box-shadows) that scroll upward at different speeds for a subtle parallax
 * "flying through space" effect. Rendered once, fixed, behind all app content.
 * Inspired by the classic pure-CSS parallax starfield.
 */
function genShadows(count: number): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * 2000);
    const y = Math.floor(Math.random() * 2000);
    parts.push(`${x}px ${y}px #FFF`);
  }
  return parts.join(", ");
}

// Generated once at module load so the field is stable across re-renders.
const SMALL = genShadows(700);
const MEDIUM = genShadows(200);
const BIG = genShadows(100);

export function StarBackground() {
  return (
    <>
      {/* Animated pinkish gradient glows (top-left, top-right, corners). */}
      <div className="aurora" aria-hidden="true" />

      {/* Parallax stars over the gradient. */}
      <div className="star-bg" aria-hidden="true">
        <div className="stars s1" style={{ ["--shadow" as string]: SMALL } as React.CSSProperties} />
        <div className="stars s2" style={{ ["--shadow" as string]: MEDIUM } as React.CSSProperties} />
        <div className="stars s3" style={{ ["--shadow" as string]: BIG } as React.CSSProperties} />
      </div>

      {/* Dark dome at the very top-center so the logo sits on its own bg color
          (#050608) — top-left/right stay gradient. */}
      <div className="logo-dome" aria-hidden="true" />
    </>
  );
}
