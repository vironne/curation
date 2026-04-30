/**
 * Helpers around the digest's "semaine du X au Y" wording. Both pipelines
 * compute the same window: the last full ISO week (Mon→Sun) preceding the
 * day the run fires.
 *
 * Cron Curation: Monday 8am  → window = previous Mon..Sun
 * Cron Business: Wed 9am     → window = previous Mon..Sun
 */

const FR_MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export interface WeekWindow {
  start: Date;       // Monday 00:00
  end: Date;         // Sunday 23:59
  startISO: string;  // YYYY-MM-DD
  endISO: string;    // YYYY-MM-DD
  startFr: string;   // 27 avril 2026
  endFr: string;     // 3 mai 2026
}

export function computeWeekWindow(today: Date = new Date()): WeekWindow {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);

  // JS: Sunday=0, Monday=1, ..., Saturday=6.
  const dow = t.getDay();
  // Days since this week's Monday.
  const daysSinceMonday = (dow + 6) % 7;
  // Start of the previous week (Monday) is this Monday minus 7 days.
  const start = new Date(t);
  start.setDate(t.getDate() - daysSinceMonday - 7);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return {
    start,
    end,
    startISO: toISODate(start),
    endISO: toISODate(end),
    startFr: toFrenchDate(start),
    endFr: toFrenchDate(end),
  };
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toFrenchDate(d: Date): string {
  return `${d.getDate()} ${FR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** YYYY/MM/DD form used by Gmail's `after:` operator. */
export function toGmailDate(d: Date): string {
  return toISODate(d).replace(/-/g, '/');
}
