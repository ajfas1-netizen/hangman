/**
 * localStorage persistence: an in-progress daily game survives a refresh, and
 * stats accumulate across days. All of it degrades quietly if storage is
 * unavailable (private windows, disabled cookies) — the game still plays, it
 * just forgets.
 */
import { PLAYING, MAX_MISSES, MAX_NEARS, SOLVE_PENALTY } from './engine.js';

/** Fallback for games saved before limits were stored alongside them. */
const DEFAULT_LIMITS = { maxMisses: MAX_MISSES, maxNears: MAX_NEARS, solvePenalty: SOLVE_PENALTY };

const GAME_KEY = 'hangdle:daily';
const STATS_KEY = 'hangdle:stats';

const EMPTY_STATS = {
  played: 0,
  wins: 0,
  streak: 0,
  maxStreak: 0,
  lastNumber: null,
  bodyUsed: [0, 0, 0, 0, 0, 0, 0],
};

/**
 * Raw guarded access. In a sandboxed iframe or with third-party storage
 * blocked, *reading the localStorage property itself* throws — not just the
 * call on it. So every access in the app goes through these two functions;
 * a bare `localStorage.getItem(...)` anywhere else is a page-killing bug.
 */
export function readRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeRaw(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;   /* storage unavailable — play on without it */
  }
}

function read(key) {
  try {
    const raw = readRaw(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  writeRaw(key, JSON.stringify(value));
}

export function serializeGame(state) {
  return {
    word: state.word,
    limits: state.limits,
    slots: state.slots,
    misses: state.misses,
    nears: state.nears,
    dead: [...state.dead],
    live: [...state.live],
    placed: [...state.placed],
    excluded: state.excluded.map((s) => [...s]),
    history: state.history,
    solveAttempts: state.solveAttempts,
    status: state.status,
  };
}

export function deserializeGame(raw) {
  return {
    word: raw.word,
    length: raw.word.length,
    limits: raw.limits ?? DEFAULT_LIMITS,
    slots: raw.slots,
    misses: raw.misses,
    nears: raw.nears,
    dead: new Set(raw.dead),
    live: new Set(raw.live),
    placed: new Set(raw.placed),
    excluded: raw.excluded.map((a) => new Set(a)),
    history: raw.history,
    solveAttempts: raw.solveAttempts,
    status: raw.status,
  };
}

export function saveDaily(number, state) {
  write(GAME_KEY, { number, game: serializeGame(state) });
}

/** Returns the saved game only if it belongs to the puzzle being asked for. */
export function loadDaily(number) {
  const saved = read(GAME_KEY);
  if (!saved || saved.number !== number) return null;
  try {
    return deserializeGame(saved.game);
  } catch {
    return null;
  }
}

export function loadStats() {
  return { ...EMPTY_STATS, ...(read(STATS_KEY) ?? {}) };
}

/**
 * Record a finished daily. Idempotent per puzzle number, so a refresh on the
 * results screen cannot inflate the numbers.
 */
export function recordResult(number, state) {
  const stats = loadStats();
  if (state.status === PLAYING || stats.lastNumber === number) return stats;

  const won = state.status === 'won';
  const next = {
    ...stats,
    played: stats.played + 1,
    wins: stats.wins + (won ? 1 : 0),
    streak: won ? (stats.lastNumber === number - 1 ? stats.streak : 0) + 1 : 0,
    lastNumber: number,
    bodyUsed: [...stats.bodyUsed],
  };
  next.maxStreak = Math.max(stats.maxStreak, next.streak);
  if (won) next.bodyUsed[Math.min(state.misses, 6)] += 1;

  write(STATS_KEY, next);
  return next;
}

export function resetStats() {
  write(STATS_KEY, EMPTY_STATS);
  return { ...EMPTY_STATS };
}

/* ---------------------------------------------------------------- leaderboard */

const BOARD_KEY = 'hangdle:board';
const NAME_KEY = 'hangdle:name';

export function playerName() {
  return readRaw(NAME_KEY) ?? '';
}

export function setPlayerName(name) {
  writeRaw(NAME_KEY, name);
}

/** { [puzzleNumber]: { [lowercased name]: entry } } */
export function loadBoard() {
  const board = read(BOARD_KEY);
  return board && typeof board === 'object' ? board : {};
}

/** One entry per name per puzzle — a re-paste corrects the old one. */
export function addToBoard(entry) {
  const board = loadBoard();
  const day = board[entry.number] ?? {};
  day[entry.name.toLowerCase()] = entry;
  board[entry.number] = day;
  write(BOARD_KEY, board);
  return board;
}

export function clearBoard() {
  write(BOARD_KEY, {});
  return {};
}
