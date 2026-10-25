import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { formatWhen } from "../utils";
import type { IconName } from "../components/Icon";

export interface AttentionItem {
  key: string;
  to: string;
  label: string;
  count: number;
  tone: "pending" | "alert" | "info";
  icon: IconName;
}

export interface AttentionState {
  /** number waiting per menu item (key = menu item key); zero shows nothing */
  counts: Record<string, number>;
  /** the "needs your attention" chips shown above the page */
  items: AttentionItem[];
}

const EMPTY: AttentionState = { counts: {}, items: [] };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What is waiting for this person, per role. Refreshes every minute, when the tab regains focus,
 * and whenever `refresh()` is called (the shell calls it on every screen change).
 */
export function useAttention(token: string | undefined, role: string | undefined) {
  const [state, setState] = useState<AttentionState>(EMPTY);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!token || !role) return;
    const counts: Record<string, number> = {};
    const items: AttentionItem[] = [];
    const add = (key: string, item: Omit<AttentionItem, "key"> | null) => {
      if (!item || item.count <= 0) return;
      counts[key] = (counts[key] ?? 0) + item.count;
      items.push({ key, ...item });
    };
    const ok = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === "fulfilled" ? r.value : null);

    try {
      if (role === "admin") {
        const [summary, pay] = await Promise.allSettled([api.getAdminSummary(token), api.adminListPayments(token, "pending")]);
        const s = ok(summary), p = ok(pay);
        if (s) add("overview", { to: "/admin/overview", count: s.providers_pending_approval, tone: "pending", icon: "addProvider", label: `${plural(s.providers_pending_approval, "provider", "providers")} awaiting approval` });
        if (p) add("adminPayments", { to: "/admin/payments", count: p.length, tone: "pending", icon: "review", label: `${plural(p.length, "payment", "payments")} to review` });
      } else if (role === "provider") {
        const [appts, cases, prof] = await Promise.allSettled([api.listMyAppointments(token), api.listMyCases(token), api.getMyProviderProfile(token)]);
        const a = ok(appts), c = ok(cases);
        if (a) {
          const req = a.filter((x) => x.status === "requested").length;
          add("appointments", { to: "/appointments", count: req, tone: "pending", icon: "appointments", label: `${plural(req, "appointment request", "appointment requests")} to confirm` });
        }
        if (c) {
          const open = c.filter((x) => x.status === "open").length;
          add("cases", { to: "/cases", count: open, tone: "info", icon: "cases", label: `${plural(open, "open case", "open cases")}` });
        }
        if (prof.status === "fulfilled") {
          const st = prof.value.approval_status;
          if (st === "pending") add("profile", { to: "/providers/setup", count: 1, tone: "info", icon: "clock", label: "Profile awaiting admin approval" });
          if (st === "rejected") add("profile", { to: "/providers/setup", count: 1, tone: "alert", icon: "alert", label: "Profile rejected — update and resubmit" });
        } else if (prof.reason instanceof ApiError && prof.reason.status === 404) {
          add("profile", { to: "/providers/setup", count: 1, tone: "alert", icon: "profile", label: "Set up your provider profile" });
        }
      } else {
        const [appts, pays] = await Promise.allSettled([api.listMyAppointments(token), api.listMyPayments(token)]);
        const a = ok(appts), p = ok(pays);
        if (a) {
          const now = Date.now();
          const upcoming = a
            .filter((x) => x.status === "confirmed" && new Date(x.scheduled_at).getTime() >= now)
            .sort((x, y) => +new Date(x.scheduled_at) - +new Date(y.scheduled_at));
          if (upcoming.length) add("appointments", { to: "/appointments", count: upcoming.length, tone: "info", icon: "appointments", label: `Next appointment: ${formatWhen(upcoming[0].scheduled_at)}` });
          const waiting = a.filter((x) => x.status === "requested").length;
          if (waiting) items.push({ key: "appointments-wait", to: "/appointments", count: waiting, tone: "pending", icon: "clock", label: `${plural(waiting, "appointment", "appointments")} awaiting confirmation` });
        }
        if (p) {
          const rejected = p.filter((x) => x.status === "rejected").length;
          const pending = p.filter((x) => x.status === "pending").length;
          add("payments", { to: "/payments", count: rejected, tone: "alert", icon: "alert", label: `${plural(rejected, "payment was", "payments were")} rejected — please resubmit` });
          if (pending) items.push({ key: "payments-wait", to: "/payments", count: pending, tone: "pending", icon: "clock", label: `${plural(pending, "payment", "payments")} awaiting review` });
        }
      }
    } catch {
      /* attention is a convenience: never break the page */
    }
    if (alive.current) setState({ counts, items });
  }, [token, role]);

  useEffect(() => {
    alive.current = true;
    if (!token) {
      setState(EMPTY);
      return;
    }
    refresh();
    const id = window.setInterval(refresh, 60_000);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, refresh]);

  return { ...state, refresh };
}
