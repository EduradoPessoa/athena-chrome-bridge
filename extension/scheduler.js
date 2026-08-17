// ====================================================================
// Athena Chrome Bridge — scheduler.js (lógica pura, testável em Node)
// Recorrência e cálculo de nextRun para tarefas agendadas.
// ====================================================================
export const DAY_MS = 86400000;

export function offsetMs(tz, utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date(utcMs));
  const name = parts.find((p) => p.type === 'timeZoneName')?.value || '';
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * ((+m[2]) * 3600 + (+(m[3] || 0)) * 60) * 1000;
}

export function zonedTimeToUtc(dateStr, timeStr, tz) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [hh, mi] = timeStr.split(':').map(Number);
  const naive = Date.UTC(y, mo - 1, d, hh, mi, 0);
  const off1 = offsetMs(tz, naive);
  const cand = naive - off1;
  const off2 = offsetMs(tz, cand);
  return cand - (off2 - off1); // corrige DST
}

export function dateStrOf(utcMs, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(utcMs));
}

function startOfDay(utcMs, tz) {
  return zonedTimeToUtc(dateStrOf(utcMs, tz), '00:00', tz);
}

function weekdayOf(utcMs, tz) {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(utcMs));
  return { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[w];
}

export function nextRun(task, now = Date.now()) {
  const s = task.schedule;
  if (!s || task.enabled === false) return null;
  const tz = s.tz || 'UTC';
  if (s.endDate && dateStrOf(now, tz) > s.endDate) return null;

  switch (s.type) {
    case 'once': {
      const t = zonedTimeToUtc(s.date, s.time, tz);
      return t > now ? t : null;
    }
    case 'daily': {
      let t = zonedTimeToUtc(dateStrOf(now, tz), s.time, tz);
      if (t <= now) t += DAY_MS;
      if (s.endDate && dateStrOf(t, tz) > s.endDate) return null;
      return t;
    }
    case 'weekly': {
      const days = [...(s.weekdays || [1, 2, 3, 4, 5])].sort((a, b) => a - b);
      for (let i = 0; i < 400; i++) {
        const dayStart = startOfDay(now, tz) + i * DAY_MS;
        if (days.includes(weekdayOf(dayStart, tz))) {
          const t = dayStart + (zonedTimeToUtc(dateStrOf(dayStart, tz), s.time, tz) - dayStart);
          if (t > now && (!s.endDate || dateStrOf(t, tz) <= s.endDate)) return t;
        }
      }
      return null;
    }
    case 'monthly': {
      const dom = Math.min(Math.max(1, s.dayOfMonth || 1), 28); // 28 evita virada de mês
      const base = new Date(now);
      for (let i = 0; i < 24; i++) {
        const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i, dom));
        const ds = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        const cand = zonedTimeToUtc(ds, s.time, tz);
        if (cand > now && (!s.endDate || dateStrOf(cand, tz) <= s.endDate)) return cand;
      }
      return null;
    }
    default:
      return null;
  }
}

export function scheduleSummary(s) {
  const t = s.time || '00:00';
  const tz = s.tz || 'UTC';
  switch (s.type) {
    case 'once': return `${s.date} ${t} (uma vez)`;
    case 'daily': return `Diariamente ${t} (${tz})`;
    case 'weekly': return `Semanal ${s.weekdays?.length ? `dias ${s.weekdays.join(',')}` : ''} ${t}`;
    case 'monthly': return `Mensal dia ${s.dayOfMonth} ${t}`;
    default: return '—';
  }
}
