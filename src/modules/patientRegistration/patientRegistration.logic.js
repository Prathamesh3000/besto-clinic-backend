'use strict';

/**
 * Pure date-range helpers for registration stats (server local time, week starts Monday,
 * same convention as dashboard.service.js).
 */

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Local YYYY-MM-DD. */
function dateKey(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Ranges for the KPI cards, each [start, end). `previous` is the preceding full
 * period (yesterday, last week, last month).
 */
function computeStatsRanges(now = new Date()) {
  const todayStart = startOfDay(now);
  const mondayOffset = (todayStart.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const weekStart = addDays(todayStart, -mondayOffset);
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

  return {
    today: { start: todayStart, end: addDays(todayStart, 1) },
    thisWeek: { start: weekStart, end: addDays(weekStart, 7) },
    thisMonth: { start: monthStart, end: new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1) },
    previous: {
      today: { start: addDays(todayStart, -1), end: todayStart },
      thisWeek: { start: addDays(weekStart, -7), end: weekStart },
      thisMonth: { start: new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1), end: monthStart },
    },
    dailyStart: addDays(todayStart, -29), // last 30 days incl. today
  };
}

/** Zero-filled daily series from aggregate rows [{ _id: { date, source }, count }]. */
function buildDailySeries(rows, now = new Date(), days = 30) {
  const today = startOfDay(now);
  const series = [];
  const index = new Map();
  for (let i = days - 1; i >= 0; i -= 1) {
    const row = { date: dateKey(addDays(today, -i)), reception: 0, qr: 0 };
    index.set(row.date, row);
    series.push(row);
  }
  for (const r of rows || []) {
    const row = index.get(r._id && r._id.date);
    if (row && (r._id.source === 'reception' || r._id.source === 'qr')) row[r._id.source] += r.count;
  }
  return series;
}

/**
 * Parse list filters `from` / `to` (ISO date or datetime). A date-only `to` is inclusive.
 * @returns {{ from: Date|null, to: Date|null, invalid: boolean }}
 */
function parseDateRange(from, to) {
  const parse = (v, endOfDay) => {
    if (!v) return null;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(v));
    const d = dateOnly ? new Date(`${v}T00:00:00`) : new Date(v);
    if (Number.isNaN(d.getTime())) return undefined;
    if (dateOnly && endOfDay) d.setDate(d.getDate() + 1);
    return d;
  };
  const f = parse(from, false);
  const t = parse(to, true);
  return { from: f || null, to: t || null, invalid: f === undefined || t === undefined };
}

module.exports = { computeStatsRanges, buildDailySeries, parseDateRange, dateKey, startOfDay };
