/**
 * Daily puzzle selection — deterministic, offline, no backend.
 *
 * Word length ramps across the week so difficulty has a rhythm: the week opens
 * on 5s and ends on 7s.
 */
import { WORDS } from './words.js';

/** Puzzle #1. Local dates, so the puzzle flips at the player's midnight. */
export const EPOCH = '2026-01-01';

/** Length by weekday, Sunday first. */
export const WEEK_SHAPE = [5, 5, 5, 6, 6, 7, 7];

const DAY_MS = 86400000;

/** Local calendar date as YYYY-MM-DD (never UTC — that would flip at the wrong hour). */
export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole days from EPOCH to the given date key. Puzzle #1 is day 0. */
export function dayIndex(key) {
  const start = parseKey(EPOCH);
  const now = parseKey(key);
  return Math.round((now - start) / DAY_MS);
}

export function puzzleNumber(key = localDateKey()) {
  return dayIndex(key) + 1;
}

function weekdayFor(day) {
  const epochWeekday = parseKey(EPOCH).getDay();
  return (((epochWeekday + day) % 7) + 7) % 7;
}

export function lengthForDay(day) {
  return WEEK_SHAPE[weekdayFor(day)];
}

/**
 * How many puzzles of this length have come before day `day` (inclusive).
 * Used so each length's pool advances one step at a time and cycles fully
 * before any word repeats.
 */
function ordinalForDay(day, length) {
  const weeks = Math.floor(day / 7);
  const perWeek = WEEK_SHAPE.filter((l) => l === length).length;
  let count = weeks * perWeek;
  for (let d = weeks * 7; d <= day; d++) {
    if (lengthForDay(d) === length) count++;
  }
  return count - 1;
}

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** A stride coprime with the pool size walks every entry before repeating. */
function strideFor(size) {
  let stride = 7919 % size;
  while (stride < 2 || gcd(stride, size) !== 1) stride++;
  return stride;
}

/** The word for a given local date. Same date, same word, on every device. */
export function wordForDate(key = localDateKey()) {
  const day = dayIndex(key);
  const length = lengthForDay(day);
  const pool = WORDS[length];
  const ordinal = ordinalForDay(day, length);
  const index = ((ordinal * strideFor(pool.length)) % pool.length + pool.length) % pool.length;
  return { word: pool[index], length, number: day + 1, date: key };
}

/** A random word for practice mode. */
export function randomWord(length) {
  const pick = length ?? [5, 6, 7][Math.floor(Math.random() * 3)];
  const pool = WORDS[pick];
  return { word: pool[Math.floor(Math.random() * pool.length)], length: pick };
}
