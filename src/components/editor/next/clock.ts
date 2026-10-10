import { useSyncExternalStore } from 'react';

// Playhead clock kept outside React state so playback doesn't re-render the whole editor every frame.
export type Clock = { get: () => number; set: (t: number) => void; subscribe: (fn: () => void) => () => void };
export function createClock(): Clock {
  let t = 0; const subs = new Set<() => void>();
  return { get: () => t, set: v => { t = v; subs.forEach(fn => fn()); }, subscribe: fn => { subs.add(fn); return () => { subs.delete(fn); }; } };
}
export const useClock = (clock: Clock) => useSyncExternalStore(clock.subscribe, clock.get, clock.get);
