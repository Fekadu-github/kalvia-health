import { useRef } from "react";
import Icon from "./Icon";

/** Search box for a list. Press "/" anywhere on the page to jump into the app-wide search instead. */
export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="list-search">
      <Icon name="search" size={18} />
      <input ref={ref} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && (
        <button type="button" className="list-search-x" onClick={() => { onChange(""); ref.current?.focus(); }} aria-label="Clear search">
          <Icon name="x" size={16} />
        </button>
      )}
    </div>
  );
}

/** Filter chips with counts, e.g. All 12 · Open 3 · Closed 9. */
export function Chips<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; count?: number }[]; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className={"chip" + (o.id === value ? " on" : "")} aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
          {o.label}
          {o.count !== undefined && <span className="chip-n">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
