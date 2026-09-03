/** Pure date-bucketing helpers shared by the dashboard's rolling average and the calibration engine. */

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayString(now: Date = new Date()): string {
  return toDateString(now);
}

/** Returns the last `n` calendar day strings (YYYY-MM-DD), oldest first, ending on `today`. */
export function lastNDayStrings(n: number, today: Date = new Date()): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(toDateString(d));
  }
  return days;
}

/** Whole days between two YYYY-MM-DD date strings (positive if `end` is after `start`). */
export function daysBetween(start: string, end: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / msPerDay);
}
