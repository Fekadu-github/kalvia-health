import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import BrandMark from "../components/BrandMark";
import ThemeToggle from "../components/ThemeToggle";
import Icon from "../components/Icon";
import CommandPalette from "../components/CommandPalette";
import { navFor, quickKeys, titleFor } from "../lib/nav";
import { useAttention } from "../lib/useAttention";

const read = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
};
const keep = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage blocked */
  }
};

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
};

export default function AppShell() {
  const { session, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [pal, setPal] = useState(false);
  const [rail, setRail] = useState<boolean>(() => read("kalvia_rail", false));
  const [folds, setFolds] = useState<Record<string, boolean>>(() => read("kalvia_folds", {}));

  const items = useMemo(() => navFor(session?.role), [session?.role]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof items>();
    items.forEach((i) => m.set(i.group, [...(m.get(i.group) ?? []), i]));
    return [...m.entries()];
  }, [items]);
  const quick = useMemo(() => quickKeys(session?.role).map((k) => items.find((i) => i.key === k)).filter((i): i is (typeof items)[number] => !!i), [items, session?.role]);

  const { counts, items: attention, refresh } = useAttention(session?.token, session?.role);
  const title = titleFor(location.pathname, items);

  // each screen change closes the drawer and re-checks what is waiting
  useEffect(() => {
    setDrawer(false);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);
  useEffect(() => {
    if (!drawer) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, [drawer]);

  // Keyboard: Ctrl/⌘ K or "/" opens search; "G" then a letter jumps to a screen (G P providers, G C cases ...)
  const chord = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPal(true);
        return;
      }
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector("dialog[open]")) return;
      if (e.key === "/") {
        e.preventDefault();
        setPal(true);
      } else if (chord.current !== null) {
        const hit = items.find((i) => i.chord === e.key.toLowerCase());
        window.clearTimeout(chord.current);
        chord.current = null;
        if (hit) {
          e.preventDefault();
          navigate(hit.to);
        }
      } else if (e.key.toLowerCase() === "g") {
        chord.current = window.setTimeout(() => (chord.current = null), 1200);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [items, navigate]);

  const toggleRail = () =>
    setRail((r) => {
      keep("kalvia_rail", !r);
      return !r;
    });
  const isOpen = (g: string, ks: typeof items) => ks.some((i) => location.pathname.startsWith(i.to)) || (folds[g] ?? true);
  const fold = (g: string) =>
    setFolds((f) => {
      const n = { ...f, [g]: !(f[g] ?? true) };
      keep("kalvia_folds", n);
      return n;
    });

  const displayName = `${session?.title ? `${session.title} ` : ""}${session?.fullName ?? ""}`.trim();
  const initial = (session?.fullName ?? "?").trim().slice(0, 1).toUpperCase();
  const link = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : "");
  const shown = attention.filter((a) => a.to !== location.pathname);

  return (
    <div className={"app-shell" + (rail ? " rail" : "") + (drawer ? " drawer-open" : "")}>
      <header className="mobile-bar">
        <button className="bar-btn" onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={drawer}>
          <Icon name="menu" size={22} />
        </button>
        <BrandMark size={28} />
        <span className="mobile-bar-title">{title}</span>
        <button className="bar-btn" onClick={() => setPal(true)} aria-label="Search">
          <Icon name="search" size={21} />
        </button>
        <ThemeToggle />
      </header>

      <div className={`sidebar-backdrop${drawer ? " show" : ""}`} onClick={() => setDrawer(false)} aria-hidden="true" />

      <aside className={`sidebar${drawer ? " open" : ""}`}>
        <div className="sidebar-brand">
          <BrandMark size={44} />
          <div className="sidebar-brand-text">
            <div className="sidebar-brand-name">Kalvia</div>
            <div className="sidebar-brand-sub">Health</div>
          </div>
        </div>

        <button type="button" className="sidebar-search" onClick={() => { setDrawer(false); setPal(true); }} aria-label="Search" title="Search (Ctrl K or /)">
          <Icon name="search" size={18} />
          <span>Search…</span>
          <kbd>Ctrl K</kbd>
        </button>

        <nav aria-label="Main">
          {groups.map(([g, ks]) => {
            const open = isOpen(g, ks);
            return (
              <div key={g} className="nav-group">
                <button type="button" className="nav-heading" aria-expanded={open} onClick={() => fold(g)} title={g}>
                  <span>{g}</span>
                  <Icon name="chevDown" size={14} className={open ? "" : "turned"} />
                </button>
                {open &&
                  ks.map((i) => (
                    <NavLink key={i.key} to={i.to} end={i.end} className={link} title={`${i.label} (G then ${i.chord.toUpperCase()})`}>
                      <Icon name={i.icon} />
                      <span>{i.label}</span>
                      {counts[i.key] ? <i className="nav-badge" aria-label={`${counts[i.key]} waiting`}>{counts[i.key]}</i> : null}
                    </NavLink>
                  ))}
              </div>
            );
          })}
        </nav>

        <button type="button" className="rail-toggle" onClick={toggleRail} aria-label={rail ? "Expand menu" : "Collapse menu"} title={rail ? "Expand menu" : "Collapse menu"}>
          <Icon name={rail ? "expand" : "collapse"} size={16} />
        </button>

        <div className="sidebar-footer">
          <ThemeToggle variant="full" />
          <div className="user-card">
            <span className="user-avatar">{initial}</span>
            <div className="user-meta">
              <div className="user-name">{displayName}</div>
              <div className="user-role">{session?.role}</div>
            </div>
            <button className="signout-btn" onClick={logout} title="Sign out" aria-label="Sign out">
              <Icon name="logout" size={19} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="main-inner">
          {shown.length > 0 && (
            <section className="attn" aria-label="Needs your attention">
              <span className="attn-title"><Icon name="bell" size={16} /> Needs your attention</span>
              {shown.map((a) => (
                <Link key={a.key} to={a.to} className={`attn-chip ${a.tone}`}>
                  <Icon name={a.icon} size={16} />
                  <span>{a.label}</span>
                  <Icon name="chev" size={14} />
                </Link>
              ))}
            </section>
          )}
          <Outlet />
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Quick menu">
        {quick.map((i) => (
          <NavLink key={i.key} to={i.to} end={i.end} className={link}>
            <Icon name={i.icon} size={22} />
            <span>{i.short}</span>
            {counts[i.key] ? <i className="nav-badge">{counts[i.key]}</i> : null}
          </NavLink>
        ))}
        <button type="button" onClick={() => setDrawer(true)} aria-label="More">
          <Icon name="more" size={22} />
          <span>More</span>
        </button>
      </nav>

      {pal && <CommandPalette onClose={() => setPal(false)} />}
    </div>
  );
}
