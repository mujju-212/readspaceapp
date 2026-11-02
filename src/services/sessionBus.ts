/**
 * Tiny global session-state pub/sub.
 *
 * When sign-in completes through the system browser the app only receives a
 * deep link — no navigation focus event fires, so screens that loaded the user
 * account on mount would never notice. Components subscribe with
 * useSessionVersion() and re-read their data whenever the version bumps.
 */
import { useEffect, useState } from 'react';

type Listener = () => void;

let version = 0;
const listeners = new Set<Listener>();

export const sessionBus = {
  bump(): void {
    version += 1;
    for (const l of Array.from(listeners)) {
      try {
        l();
      } catch {
        // A broken listener must never break the emitter
      }
    }
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getVersion(): number {
    return version;
  },
};

/** Re-renders the component whenever the app session changes (sign-in/out, Drive connect). */
export function useSessionVersion(): number {
  const [v, setV] = useState(sessionBus.getVersion());
  useEffect(() => sessionBus.subscribe(() => setV(sessionBus.getVersion())), []);
  return v;
}
