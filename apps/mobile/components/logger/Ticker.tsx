// Re-renders only its own subtree on an interval, so a running countdown
// doesn't re-render the whole logger screen (and its header) 4x a second.
import { useEffect, useState, type ReactNode } from 'react';

export default function Ticker({ children, intervalMs = 250 }: { children: (now: number) => ReactNode; intervalMs?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return <>{children(now)}</>;
}
