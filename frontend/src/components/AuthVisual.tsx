import BrandMark from "./BrandMark";

/** Leaf-vein rosette: rotated leaf outlines around a point, echoing the Kalvia leaf mark. */
function LeafRosette({ cx, cy, r, count, opacity }: { cx: number; cy: number; r: number; count: number; opacity: number }) {
  return (
    <g transform={`translate(${cx} ${cy})`} fill="none" stroke="#F0D79B" strokeWidth="0.9" opacity={opacity}>
      {Array.from({ length: count }, (_, i) => (
        <path key={i} transform={`rotate(${(i * 360) / count})`} d={`M0 0 C ${r * 0.34} ${-r * 0.35}, ${r * 0.34} ${-r * 0.75}, 0 ${-r} C ${-r * 0.34} ${-r * 0.75}, ${-r * 0.34} ${-r * 0.35}, 0 0 Z`} />
      ))}
      <circle r={r} strokeWidth="1.2" />
      <circle r={r * 0.2} strokeWidth="1.2" />
    </g>
  );
}

export default function AuthVisual() {
  return (
    <div className="auth-visual">
      <svg className="auth-visual-deco" viewBox="0 0 500 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <LeafRosette cx={430} cy={150} r={230} count={28} opacity={0.22} />
        <LeafRosette cx={60} cy={640} r={150} count={20} opacity={0.14} />
        {/* heartbeat line */}
        <path
          d="M0 330 H120 L145 330 L165 280 L192 392 L218 300 L236 330 H500"
          fill="none"
          stroke="#D9A441"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        />
        <circle cx="236" cy="330" r="5" fill="#D9A441" />
        <circle cx="236" cy="330" r="12" fill="none" stroke="#D9A441" strokeWidth="1" opacity="0.5" />
      </svg>

      <div className="auth-visual-content">
        <div className="auth-visual-mark">
          <BrandMark size={72} />
        </div>

        <h1 className="auth-visual-brand">Kalvia Health</h1>
        <p className="auth-visual-tagline">Care that meets you where you are.</p>
        <ul className="auth-visual-points">
          <li>Find a trusted provider and open a case</li>
          <li>Book and follow every appointment</li>
          <li>Secure payments and documents in one place</li>
        </ul>
      </div>
    </div>
  );
}
