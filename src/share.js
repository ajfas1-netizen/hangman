/**
 * Share text. The grid wraps at the word length so the result reads as a block
 * the same shape as the puzzle, and it spoils nothing — position of a square
 * says nothing about which slot was guessed.
 */
import { HIT, NEAR, MAX_MISSES, MAX_NEARS, WON } from './engine.js';

const SQUARE = { [HIT]: '🟩', [NEAR]: '🟨' };
const MISS_SQUARE = '⬛';

export function shareGrid(state) {
  const marks = state.history.map((h) => {
    if (h.solve) return h.correct ? '⭐' : '❌';
    return SQUARE[h.result] ?? MISS_SQUARE;
  });

  const rows = [];
  for (let i = 0; i < marks.length; i += state.length) {
    rows.push(marks.slice(i, i + state.length).join(''));
  }
  return rows.join('\n');
}

export function shareText(state, { number, url = '' } = {}) {
  const title = number ? `Gallows #${number}` : 'Gallows';
  const outcome = state.status === WON ? 'survived' : 'hanged';
  const lines = [
    `${title} · ${state.length} letters · ${outcome}`,
    `body ${Math.min(state.misses, MAX_MISSES)}/${MAX_MISSES} · rope ${Math.min(state.nears, MAX_NEARS)}/${MAX_NEARS}`,
    '',
    shareGrid(state),
  ];
  if (url) lines.push('', url);
  return lines.join('\n');
}

/** Clipboard with a fallback for browsers that block the async API. */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}
