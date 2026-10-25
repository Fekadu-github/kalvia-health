import { useCallback, useState } from "react";

/** useState that remembers its value in this browser (per-viewer convenience; works without storage). */
export function usePersisted<T extends string>(key: string, initial: T, allowed?: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(key) as T | null;
      if (v !== null && (!allowed || allowed.includes(v))) return v;
    } catch {
      /* storage blocked */
    }
    return initial;
  });
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, v);
      } catch {
        /* storage blocked */
      }
    },
    [key]
  );
  return [value, set] as const;
}
