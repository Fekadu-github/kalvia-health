/** Kalvia's own emblem: gold ring, cream leaf with a centre vein, and a green care badge. */
export default function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r="38" fill="rgba(255,255,255,0.05)" stroke="#D9A441" strokeWidth="2" />
      <path d="M40 14 C55 26 55 54 40 66 C25 54 25 26 40 14 Z" fill="#F6F3EC" />
      <line x1="40" y1="18" x2="40" y2="62" stroke="#1F4B43" strokeWidth="1.5" />
      <circle cx="58" cy="46" r="9" fill="#1F4B43" stroke="#F6F3EC" strokeWidth="2" />
      <line x1="58" y1="42" x2="58" y2="50" stroke="#F6F3EC" strokeWidth="1.5" />
      <line x1="54" y1="46" x2="62" y2="46" stroke="#F6F3EC" strokeWidth="1.5" />
    </svg>
  );
}
