export default function AuthVisual() {
  return (
    <div className="auth-visual">
      <svg className="auth-visual-deco" viewBox="0 0 500 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <circle cx="470" cy="430" r="140" fill="rgba(255,255,255,0.05)" />
        <circle cx="60" cy="560" r="10" fill="var(--accent)" />
        <circle cx="120" cy="600" r="6" fill="rgba(255,255,255,0.6)" />
        <circle cx="30" cy="610" r="5" fill="rgba(255,255,255,0.6)" />
        <path
          d="M0 300 C 60 260, 90 340, 150 300 S 260 240, 320 290 S 430 320, 500 280"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
        />
        <path d="M60 560 L120 600 M60 560 L30 610" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
      </svg>

      <div className="auth-visual-content">
        <div className="auth-visual-mark">
          <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r="38" fill="none" stroke="var(--accent)" strokeWidth="2" />
            <path
              d="M40 14 C55 26 55 54 40 66 C25 54 25 26 40 14 Z"
              fill="#F6F3EC"
            />
            <line x1="40" y1="18" x2="40" y2="62" stroke="var(--primary)" strokeWidth="1.5" />
            <circle cx="58" cy="46" r="9" fill="var(--primary)" stroke="#F6F3EC" strokeWidth="2" />
            <line x1="58" y1="42" x2="58" y2="50" stroke="#F6F3EC" strokeWidth="1.5" />
            <line x1="54" y1="46" x2="62" y2="46" stroke="#F6F3EC" strokeWidth="1.5" />
          </svg>
        </div>

        <h1 className="auth-visual-brand">Kalvia Health</h1>
        <p className="auth-visual-tagline">Care that meets you where you are.</p>
      </div>
    </div>
  );
}
