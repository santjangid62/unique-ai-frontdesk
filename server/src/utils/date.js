export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMinutes(date, minutes) {
  return new Date(new Date(date).getTime() + minutes * 60 * 1000);
}

/** Parses YYYY-MM-DD plus HH:mm into a Date (server local timezone). */
export function parseSlot(dateText, timeText = '10:00') {
  if (!dateText) return null;
  const date = String(dateText).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = /^\d{1,2}:\d{2}$/.test(String(timeText || '').trim()) ? String(timeText).trim() : '10:00';
  const [hours, minutes] = time.split(':').map(Number);
  const parsed = new Date(`${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Interprets common natural language hints like "tomorrow 4pm", "kal 11:30". */
export function parseNaturalSlot(text, now = new Date()) {
  if (!text) return null;
  const raw = String(text).toLowerCase();
  const isoDate = raw.match(/(\d{4}-\d{2}-\d{2})/);
  const dayMonth = raw.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  const time = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);

  let date = null;
  if (isoDate) date = isoDate[1];
  else if (dayMonth) {
    const [, d, m, y] = dayMonth;
    date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  } else if (/(tomorrow|kal)/.test(raw)) {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    date = t.toISOString().slice(0, 10);
  } else if (/(today|aaj)/.test(raw)) {
    date = new Date(now).toISOString().slice(0, 10);
  }

  let hours = 10;
  let minutes = 0;
  if (time) {
    hours = Number(time[1]);
    minutes = Number(time[2] || 0);
    if (time[3] === 'pm' && hours < 12) hours += 12;
    if (time[3] === 'am' && hours === 12) hours = 0;
  }
  if (!date) return null;
  return parseSlot(date, `${hours}:${String(minutes).padStart(2, '0')}`);
}
