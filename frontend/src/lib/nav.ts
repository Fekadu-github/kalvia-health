import type { IconName } from "../components/Icon";

export interface NavItem {
  key: string; // also the key used by useAttention counts
  to: string;
  label: string;
  short: string; // label on the phone's bottom bar
  icon: IconName;
  group: string;
  end?: boolean;
  chord: string; // "g" then this letter jumps here
  roles?: string[]; // omitted = every role
}

const ALL: NavItem[] = [
  { key: "providers", to: "/providers", label: "Find a provider", short: "Providers", icon: "providers", group: "Care", end: true, chord: "p" },
  { key: "cases", to: "/cases", label: "My cases", short: "Cases", icon: "cases", group: "Care", chord: "c" },
  { key: "appointments", to: "/appointments", label: "Appointments", short: "Visits", icon: "appointments", group: "Care", chord: "a" },
  { key: "payments", to: "/payments", label: "Payments & documents", short: "Payments", icon: "payments", group: "Account", chord: "y", roles: ["patient"] },
  { key: "profile", to: "/providers/setup", label: "My profile", short: "Profile", icon: "profile", group: "Account", chord: "m", roles: ["provider"] },
  { key: "myEarnings", to: "/earnings", label: "My earnings", short: "Earnings", icon: "payments", group: "Account", chord: "e", roles: ["provider"] },
  { key: "adminEarnings", to: "/admin/earnings", label: "Earnings & shares", short: "Earnings", icon: "overview", group: "Administration", chord: "e", roles: ["admin"] },
  { key: "adminReports", to: "/admin/reports", label: "Fee reports", short: "Reports", icon: "overview", group: "Administration", chord: "f", roles: ["admin"] },
  { key: "overview", to: "/admin/overview", label: "Overview", short: "Overview", icon: "overview", group: "Administration", chord: "o", roles: ["admin"] },
  { key: "createProvider", to: "/admin/providers", label: "Create provider", short: "Create", icon: "addProvider", group: "Administration", chord: "n", roles: ["admin"] },
  { key: "adminPayments", to: "/admin/payments", label: "Payment review", short: "Payments", icon: "review", group: "Administration", chord: "r", roles: ["admin"] },
];

export const navFor = (role?: string): NavItem[] => ALL.filter((i) => !i.roles || (role && i.roles.includes(role)));

/** The screens used most by each role: shown on the phone's bottom bar. */
export const quickKeys = (role?: string): string[] =>
  role === "admin" ? ["overview", "adminPayments", "createProvider"] : role === "provider" ? ["cases", "appointments", "profile"] : ["providers", "cases", "appointments"];

export const titleFor = (pathname: string, items: NavItem[]): string => {
  if (pathname.startsWith("/cases/")) return "Case";
  const hit = [...items].sort((a, b) => b.to.length - a.to.length).find((i) => pathname === i.to || pathname.startsWith(i.to + "/"));
  return hit?.label ?? "Kalvia Health";
};
