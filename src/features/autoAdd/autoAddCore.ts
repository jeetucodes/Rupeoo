export type AutoAddStatus = 'on' | 'off' | 'paused';
export type PauseDuration = '30m' | '1h' | 'tomorrow' | number;

/**
 * Calculates a pause expiration timestamp based on duration choice.
 * - '30m': 30 minutes from now
 * - '1h': 60 minutes from now
 * - 'tomorrow': Tomorrow at 8:00 AM (or +24h if already passed)
 * - number: specified minutes from now
 */
export function calculatePauseTimestamp(duration: PauseDuration, nowMs: number = Date.now()): number {
  if (duration === '30m') {
    return nowMs + 30 * 60 * 1000;
  }
  if (duration === '1h') {
    return nowMs + 60 * 60 * 1000;
  }
  if (duration === 'tomorrow') {
    const d = new Date(nowMs);
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    if (d.getTime() <= nowMs) {
      d.setDate(d.getDate() + 1);
    }
    return d.getTime();
  }
  if (typeof duration === 'number' && duration > 0) {
    return nowMs + Math.round(duration * 60 * 1000);
  }
  return nowMs + 60 * 60 * 1000;
}

/**
 * Formats the real resume time (e.g. "11:45 PM" or "8:00 AM").
 */
export function formatResumeTime(timestamp: number): string {
  if (!timestamp || timestamp <= Date.now()) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * Formats remaining minutes into a compact countdown label (e.g. "42m", "1h", "1h 15m").
 */
export function formatCountdownMinutes(timestamp: number, nowMs: number = Date.now()): string {
  if (!timestamp || timestamp <= nowMs) return '';
  const ms = timestamp - nowMs;
  const mins = Math.max(1, Math.ceil(ms / (60 * 1000)));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}
