import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Appointment, Case, Provider } from "../api";
import { useAuth } from "../context/AuthContext";
import { navFor } from "../lib/nav";
import { formatWhen } from "../utils";
import Icon, { type IconName } from "./Icon";

interface Hit {
  id: string;
  group: string;
  icon: IconName;
  title: string;
  sub?: string;
  to: string;
  tag?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/_/g, " ");

// every typed word must appear somewhere in the item; items whose title starts with the first word rank higher
function rank(hay: string, title: string, words: string[]): number {
  const h = norm(hay);
  if (!words.every((w) => h.includes(w))) return 0;
  return norm(title).startsWith(words[0]) ? 2 : 1;
}

/**
 * One search box for everything: screens, cases, appointments and providers.
 * Opens with Ctrl+K / ⌘K or "/", Enter opens the highlighted result.
 */
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [hi, setHi] = useState(0);
  const [cases, setCases] = useState<Case[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Unmounting removes the dialog from the top layer by itself; Esc and the close button fire onClose below.
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  // load what can be searched once, when the box opens; any list the role cannot see is simply skipped
  useEffect(() => {
    if (!session) return;
    let live = true;
    Promise.allSettled([api.listMyCases(session.token), api.listMyAppointments(session.token), api.listProviders(session.token)]).then(([c, a, p]) => {
      if (!live) return;
      if (c.status === "fulfilled") setCases(c.value);
      if (a.status === "fulfilled") setAppts(a.value);
      if (p.status === "fulfilled") setProviders(p.value);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [session]);

  const groups = useMemo(() => {
    const words = norm(text).split(/\s+/).filter(Boolean);
    const q = (arr: [number, Hit][], n: number) => arr.filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, n).map(([, h]) => h);

    const pages: Hit[] = navFor(session?.role).map((i) => ({ id: "p:" + i.key, group: "Go to", icon: i.icon, title: i.label, sub: `G then ${i.chord.toUpperCase()}`, to: i.to }));
    const caseHits: [number, Hit][] = [...cases]
      .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
      .map((c) => [words.length ? rank(`${c.reason} ${c.status} ${c.case_id}`, c.reason, words) : 1, { id: "c:" + c.case_id, group: "Cases", icon: "cases", title: c.reason, sub: `${c.status.replace(/_/g, " ")} · opened ${new Date(c.created_at).toLocaleDateString()}`, to: `/cases/${c.case_id}`, tag: c.status }]);
    if (!words.length) {
      const g = [{ key: "Go to", items: pages }];
      const recent = q(caseHits, 4);
      if (recent.length) g.push({ key: "Recent cases", items: recent });
      return g;
    }
    const apptHits: [number, Hit][] = appts.map((a) => {
      const when = formatWhen(a.scheduled_at);
      const type = a.consultation_type.replace("_", " ");
      return [rank(`${when} ${type} ${a.status} ${a.notes ?? ""}`, when, words), { id: "a:" + a.appointment_id, group: "Appointments", icon: "appointments", title: `${when} · ${type}`, sub: `${a.status} · ${a.duration_minutes} min`, to: `/cases/${a.case_id}`, tag: a.status }];
    });
    const provHits: [number, Hit][] = providers.map((p) => {
      const name = `${p.title ? p.title + " " : ""}${p.full_name}`;
      return [rank(`${name} ${p.specialty} ${p.languages ?? ""} ${p.bio ?? ""}`, name, words), { id: "pr:" + p.provider_id, group: "Providers", icon: "providers", title: name, sub: norm(p.specialty), to: `/providers?q=${encodeURIComponent(p.full_name)}` }];
    });
    const out = [
      { key: "Go to", items: pages.filter((p) => words.every((w) => norm(p.title).includes(w))).slice(0, 3) },
      { key: "Cases", items: q(caseHits, 5) },
      { key: "Appointments", items: q(apptHits, 4) },
      { key: "Providers", items: q(provHits, 5) },
    ];
    return out.filter((g) => g.items.length);
  }, [text, cases, appts, providers, session?.role]);

  const flat = groups.flatMap((g) => g.items);
  useEffect(() => setHi(0), [text]);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [hi]);

  const choose = (h: Hit) => {
    onClose();
    navigate(h.to);
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && flat[hi]) {
      e.preventDefault();
      choose(flat[hi]);
    }
  };

  let idx = -1;
  return (
    <dialog ref={ref} className="pal" aria-label="Search" onClose={onClose}>
      <div className="pal-in">
        <Icon name="search" size={20} />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="pal-list"
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={keys}
          placeholder="Search cases, appointments, providers, screens…"
          aria-label="Search"
        />
        <button type="button" className="pal-x" onClick={() => ref.current?.close()} aria-label="Close search">
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className="pal-list" id="pal-list" role="listbox" ref={list}>
        {groups.map((g) => (
          <div key={g.key} className="pal-group">
            <div className="pal-head">{g.key}</div>
            {g.items.map((h) => {
              idx += 1;
              const i = idx;
              return (
                <div
                  key={h.id}
                  role="option"
                  aria-selected={i === hi}
                  className={"pal-row" + (i === hi ? " on" : "")}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(h);
                  }}
                >
                  <span className="pal-ic">
                    <Icon name={h.icon} size={18} />
                  </span>
                  <span className="pal-text">
                    <b>{h.title}</b>
                    {h.sub && <small>{h.sub}</small>}
                  </span>
                  {h.tag && <span className={`status-pill ${h.tag}`}>{h.tag.replace(/_/g, " ")}</span>}
                </div>
              );
            })}
          </div>
        ))}
        {text.trim() && !flat.length && <div className="pal-none">{loaded ? <>Nothing found for “{text.trim()}”.</> : "Searching…"}</div>}
      </div>
      <div className="pal-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
        <span><kbd>Enter</kbd> open</span>
        <span><kbd>Esc</kbd> close</span>
      </div>
    </dialog>
  );
}
