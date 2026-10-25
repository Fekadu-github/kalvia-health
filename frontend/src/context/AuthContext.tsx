import { createContext, useContext, useState, ReactNode } from "react";

interface Session {
  token: string;
  userId: string;
  role: string;
  fullName: string;
  title?: string | null;
}

interface AuthContextValue {
  session: Session | null;
  login: (session: Session) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = "care_platform_session";

export function AuthProvider({ children }: { children: ReactNode }) {
  // Read the saved session synchronously so a page reload stays on the same screen
  // instead of bouncing through /login first.
  const [session, setSession] = useState<Session | null>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null; // corrupt or blocked storage
    }
  });

  const login = (s: Session) => {
    setSession(s);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  };

  const logout = () => {
    setSession(null);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  return <AuthContext.Provider value={{ session, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
