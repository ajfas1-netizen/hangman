/**
 * Hangdle — UI controller.
 *
 * Input is deliberately two-step: choose a slot, choose a letter, then commit
 * with Enter. Every guess costs something, so a stray keypress must never fire
 * one off by itself.
 */
import {
  createGame, guess, solve, letterState, excludedAt,
  HIT, NEAR, MISS, REJECTED, PLAYING, WON,
  MAX_MISSES, MAX_NEARS, SOLVE_PENALTY, BODY_PARTS,
} from './engine.js';
import { wordForDate, randomWord } from './daily.js';
import { loadDaily, saveDaily, loadStats, recordResult, resetStats, readRaw, writeRaw } from './storage.js';
import { shareGrid, shareText, copyToClipboard } from './share.js';

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

const el = (id) => document.getElementById(id);
const dom = {
  board: el('board'),
  keyboard: el('keyboard'),
  message: el('message'),
  deduction: el('deduction'),
  meta: el('puzzle-meta'),
  gallows: document.querySelector('.gallows'),
  pipsBody: el('pips-body'),
  pipsRope: el('pips-rope'),
  countBody: el('count-body'),
  countRope: el('count-rope'),
  maxBody: el('max-body'),
  maxRope: el('max-rope'),
  trackBody: el('track-body'),
  trackRope: el('track-rope'),
  tracks: document.querySelector('.tracks'),
  solveBtn: el('solve-btn'),
  resultBtn: el('result-btn'),
  newBtn: el('new-btn'),
  dailyBtn: el('daily-btn'),
};

/**
 * Practice modes. The daily is always Normal so everyone plays the same puzzle
 * under the same rules; the modes only apply to practice games.
 *
 * Hard is the 6/4 setting the balance simulation measured: still winnable, but
 * the rope causes most deaths rather than roughly half. Zen removes both
 * limits — useful for learning the placement mechanic without dying to it.
 */
const MODES = {
  normal: { label: 'Normal', limits: {}, note: 'Six body parts, five rope notches — the daily setting.' },
  hard:   { label: 'Hard',   limits: { maxNears: 4 }, note: 'Six body parts, four rope notches. Near misses bite sooner, and the rope does most of the killing.' },
  zen:    { label: 'Zen',    limits: { maxMisses: Infinity, maxNears: Infinity }, note: 'No limits. Nothing can kill you — play until the word is filled.' },
};

const PREFS_KEY = 'hangdle:practice';
const DEFAULT_PREFS = { length: 'any', difficulty: 'normal' };

function loadPrefs() {
  try {
    const saved = JSON.parse(readRaw(PREFS_KEY) ?? 'null');
    if (!saved) return { ...DEFAULT_PREFS };
    return {
      length: ['any', '5', '6', '7'].includes(String(saved.length)) ? String(saved.length) : 'any',
      difficulty: MODES[saved.difficulty] ? saved.difficulty : 'normal',
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

const view = {
  mode: 'daily',
  prefs: loadPrefs(),
  meta: null,      // { number, length }
  game: null,
  selected: 0,
  pending: null,
  ended: false,    // whether the end dialog has been shown for this game
};

/* ---------------------------------------------------------------- setup */

function startDaily() {
  const picked = wordForDate();
  view.mode = 'daily';
  view.meta = { number: picked.number, length: picked.length };
  view.game = loadDaily(picked.number) ?? createGame(picked.word);
  view.ended = view.game.status !== PLAYING;
  begin();
  if (view.game.status !== PLAYING) showEnd({ replay: true });
}

function startPractice(prefs = view.prefs) {
  view.prefs = prefs;
  writeRaw(PREFS_KEY, JSON.stringify(prefs));

  const picked = randomWord(prefs.length === 'any' ? undefined : Number(prefs.length));
  view.mode = 'practice';
  view.meta = { number: null, length: picked.length, difficulty: prefs.difficulty };
  view.game = createGame(picked.word, MODES[prefs.difficulty].limits);
  view.ended = false;
  begin();
}

function begin() {
  view.pending = null;
  view.selected = firstEmptySlot();
  buildBoard();
  buildKeyboard();
  render();
  say(
    view.game.status === PLAYING
      ? 'Pick a slot, pick a letter, press Enter.'
      : 'This one is finished.',
    'nudge',
  );
}

function firstEmptySlot() {
  const i = view.game.slots.findIndex((s) => s === null);
  return i === -1 ? 0 : i;
}

/* ---------------------------------------------------------------- build */

function buildBoard() {
  dom.board.replaceChildren();
  dom.board.style.setProperty('--slots', String(view.game.length));
  for (let i = 0; i < view.game.length; i++) {
    const b = document.createElement('button');
    b.className = 'slot';
    b.dataset.slot = String(i);
    b.addEventListener('click', () => select(i));
    dom.board.append(b);
  }
}

function buildKeyboard() {
  dom.keyboard.replaceChildren();
  KEY_ROWS.forEach((row, r) => {
    const div = document.createElement('div');
    div.className = 'kb-row';

    if (r === 2) div.append(actionKey('Enter', 'enter'));
    for (const ch of row) {
      const b = document.createElement('button');
      b.className = 'key';
      b.dataset.key = ch;
      b.textContent = ch;
      b.addEventListener('click', () => setPending(ch));
      div.append(b);
    }
    if (r === 2) div.append(actionKey('Clear', 'clear'));

    dom.keyboard.append(div);
  });
}

function actionKey(label, action) {
  const b = document.createElement('button');
  b.className = 'key wide';
  b.textContent = label;
  b.addEventListener('click', () => (action === 'enter' ? commit() : setPending(null)));
  return b;
}

/* ---------------------------------------------------------------- input */

function select(i) {
  if (view.game.slots[i] !== null) return;
  view.selected = i;
  view.pending = null;
  render();
}

function setPending(ch) {
  if (view.game.status !== PLAYING) return;
  view.pending = ch;
  render();
}

function moveSelection(step) {
  const n = view.game.length;
  for (let k = 1; k <= n; k++) {
    const i = (view.selected + step * k + n * n) % n;
    if (view.game.slots[i] === null) return select(i);
  }
}

function advance() {
  const from = view.selected;
  const n = view.game.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (view.game.slots[i] === null) {
      view.selected = i;
      return;
    }
  }
}

function commit() {
  const g = view.game;
  if (g.status !== PLAYING || !view.pending) {
    if (g.status === PLAYING && !view.pending) say('Choose a letter first.', 'nudge');
    return;
  }

  const letter = view.pending;
  const index = view.selected;
  const outcome = guess(g, letter, index);
  view.pending = null;

  if (outcome.result === REJECTED) {
    say(rejectionCopy(outcome.reason, letter, index), 'nudge');
    render();
    return;
  }

  if (outcome.result === HIT) advance();
  render();
  flash(index, outcome.result);
  say(outcomeCopy(outcome.result, letter, index), outcome.result);
  finishIfOver();
}

function callTheWord() {
  if (view.game.status !== PLAYING) return;
  const dialog = el('solve-dialog');
  const input = el('solve-input');
  input.value = '';
  input.maxLength = view.game.length;
  input.placeholder = '·'.repeat(view.game.length);
  dialog.showModal();
  input.focus();
}

function submitCall(word) {
  const outcome = solve(view.game, word);
  if (outcome.result === REJECTED) {
    say(`That needs to be ${view.game.length} letters.`, 'nudge');
    return;
  }
  view.selected = firstEmptySlot();
  render();
  if (outcome.result === 'wrong-solve') {
    say(`<span class="k">Wrong</span> — that's two body parts.`, 'miss');
    dom.gallows.classList.add('shake');
    setTimeout(() => dom.gallows.classList.remove('shake'), 400);
  }
  finishIfOver();
}

/* ---------------------------------------------------------------- render */

function render() {
  const g = view.game;

  const mode = MODES[view.meta.difficulty] ?? MODES.normal;
  dom.meta.textContent = view.mode === 'daily'
    ? `Daily #${view.meta.number} · ${g.length} letters`
    : `Practice · ${mode.label} · ${g.length} letters`;

  // Slots
  [...dom.board.children].forEach((slot, i) => {
    const filled = g.slots[i] !== null;
    const selected = i === view.selected && g.status === PLAYING;

    slot.classList.toggle('filled', filled);
    slot.dataset.selected = String(selected);
    slot.disabled = filled || g.status !== PLAYING;

    if (filled) {
      slot.textContent = g.slots[i];
      slot.setAttribute('aria-label', `Slot ${i + 1}: ${g.slots[i]}`);
    } else if (selected && view.pending) {
      slot.replaceChildren(Object.assign(document.createElement('span'), {
        className: 'pending',
        textContent: view.pending,
      }));
      slot.setAttribute('aria-label', `Slot ${i + 1}, ${view.pending} pending`);
    } else {
      slot.textContent = '';
      slot.setAttribute('aria-label', `Slot ${i + 1}, empty`);
    }
  });

  // Per-slot eliminations for the selected slot
  const out = g.status === PLAYING ? excludedAt(g, view.selected) : [];
  if (out.length) {
    dom.deduction.replaceChildren(
      Object.assign(document.createElement('span'), {
        textContent: `Ruled out of slot ${view.selected + 1}:`,
      }),
      ...out.map((ch) => Object.assign(document.createElement('span'), {
        className: 'out',
        textContent: ch,
      })),
    );
  } else {
    dom.deduction.replaceChildren();
  }

  // Keyboard
  for (const key of dom.keyboard.querySelectorAll('.key[data-key]')) {
    const ch = key.dataset.key;
    const state = letterState(g, ch);
    key.dataset.state = state;
    key.dataset.pending = String(view.pending === ch);
    key.disabled = g.status !== PLAYING || state === 'dead';
    key.setAttribute('aria-label', `${ch}, ${KEY_LABEL[state]}`);
  }

  renderActions();
  renderTracks();
}

/**
 * A finished game used to leave the player staring at a dead board with no
 * obvious way out. The row now always offers the next move: the result you just
 * got, another game, and the way back to today's puzzle.
 */
function renderActions() {
  const playing = view.game.status === PLAYING;
  dom.solveBtn.hidden = !playing;
  dom.resultBtn.hidden = playing;
  dom.dailyBtn.hidden = view.mode !== 'practice';
}

const KEY_LABEL = {
  unknown: 'untried',
  live: 'in the word',
  placed: 'placed',
  dead: 'ruled out',
};

function renderTracks() {
  const g = view.game;
  const { maxMisses, maxNears } = g.limits;

  // Zen has nothing to fill, so the meters become plain tallies and the figure
  // never goes up — a completed gallows that cannot kill you would be a lie.
  if (!Number.isFinite(maxMisses) || !Number.isFinite(maxNears)) {
    dom.tracks.classList.add('limitless');
    dom.countBody.textContent = String(g.misses);
    dom.countRope.textContent = String(g.nears);
    pips(dom.pipsBody, 0, 0);
    pips(dom.pipsRope, 0, 0);
    dom.trackBody.classList.remove('full');
    dom.trackRope.classList.remove('full');
    for (const node of dom.gallows.querySelectorAll('.part, .coil')) node.classList.remove('on');
    dom.gallows.classList.remove('rope-full', 'dead');
    return;
  }

  dom.tracks.classList.remove('limitless');
  const body = Math.min(g.misses, maxMisses);
  const rope = Math.min(g.nears, maxNears);

  pips(dom.pipsBody, body, maxMisses);
  pips(dom.pipsRope, rope, maxNears);
  dom.countBody.textContent = String(body);
  dom.countRope.textContent = String(rope);
  dom.maxBody.textContent = String(maxMisses);
  dom.maxRope.textContent = String(maxNears);
  dom.trackBody.classList.toggle('full', body >= maxMisses);
  dom.trackRope.classList.toggle('full', rope >= maxNears);

  BODY_PARTS.forEach((part, i) => {
    dom.gallows.querySelector(`[data-part="${part}"]`).classList.toggle('on', i < body);
  });
  // The rope has more coils drawn than the track is long; the extras stay dark.
  for (const coil of dom.gallows.querySelectorAll('.coil')) {
    const n = Number(coil.dataset.coil);
    coil.classList.toggle('on', n <= rope);
    coil.classList.toggle('unused', n > maxNears);
  }
  dom.gallows.classList.toggle('rope-full', rope >= maxNears);
  dom.gallows.classList.toggle('dead', g.status !== PLAYING && g.status !== WON);
}

function pips(host, filled, total) {
  if (host.children.length !== total) {
    host.replaceChildren(...Array.from({ length: total }, () => {
      const s = document.createElement('span');
      s.className = 'pip';
      return s;
    }));
  }
  [...host.children].forEach((p, i) => p.classList.toggle('on', i < filled));
}

function flash(index, result) {
  const slot = dom.board.children[index];
  if (!slot) return;
  const cls = result === HIT ? 'pop' : 'shake';
  slot.classList.remove('pop', 'shake');
  void slot.offsetWidth;   // restart the animation
  slot.classList.add(cls);
  setTimeout(() => slot.classList.remove(cls), 400);
}

function say(html, tone = '') {
  dom.message.className = `message ${tone}`;
  dom.message.innerHTML = html;
}

/* ---------------------------------------------------------------- copy */

function outcomeCopy(result, letter, index) {
  const L = `<span class="k">${letter}</span>`;
  const slot = index + 1;

  if (result === HIT) return `${L} locks into slot ${slot}.`;
  if (result === NEAR) return `${L} is in the word — just not in slot ${slot}. The rope tightens.`;

  // A miss has two honest flavours, and the difference matters to the player.
  return view.game.placed.has(letter)
    ? `Every ${L} is already on the board. That's a body part.`
    : `No ${L} in this word. That's a body part.`;
}

function rejectionCopy(reason, letter, index) {
  switch (reason) {
    case 'filled': return `Slot ${index + 1} is already filled.`;
    case 'known-dead': return `You already know there's no <span class="k">${letter}</span> left to find.`;
    case 'known-excluded': return `You've already ruled <span class="k">${letter}</span> out of slot ${index + 1}.`;
    case 'over': return 'This one is finished.';
    default: return 'Pick a letter and a slot.';
  }
}

/* ---------------------------------------------------------------- endgame */

function finishIfOver() {
  const g = view.game;
  if (view.mode === 'daily') saveDaily(view.meta.number, g);
  if (g.status === PLAYING || view.ended) return;

  view.ended = true;
  if (view.mode === 'daily') recordResult(view.meta.number, g);
  render();
  setTimeout(() => showEnd({ replay: false }), 700);
}

function showEnd({ replay }) {
  const g = view.game;
  const won = g.status === WON;

  el('end-title').textContent = won ? 'You made it out.' : 'Hanged.';
  el('end-word').textContent = g.word;
  el('end-grid').textContent = shareGrid(g);
  el('share-btn').hidden = view.mode !== 'daily';

  const { maxMisses, maxNears } = g.limits;
  const wrongCalls = g.history.filter((h) => h.solve && !h.correct).length;
  el('end-note').textContent = won
    ? `${g.misses} body ${plural(g.misses, 'part')}, ${g.nears} rope ${plural(g.nears, 'notch', 'notches')}.`
    : g.nears >= maxNears
      ? `The rope got you — ${maxNears} near misses.`
      : wrongCalls
        ? `${maxMisses} body parts — ${wrongCalls} wrong ${plural(wrongCalls, 'call')} cost you ${wrongCalls * 2} of them.`
        : `${maxMisses} wrong letters. The body was finished.`;

  // Always leave a way forward from here, in both directions.
  el('again-btn').textContent = view.mode === 'practice' ? 'Play again' : 'Practice word';
  el('home-btn').hidden = view.mode !== 'practice';
  el('end-dialog').showModal();
}

function plural(n, one, many = `${one}s`) {
  return n === 1 ? one : many;
}

/* ---------------------------------------------------------------- stats */

function showStats() {
  const s = loadStats();
  const pct = s.played ? Math.round((s.wins / s.played) * 100) : 0;

  el('stat-row').replaceChildren(
    ...[
      [s.played, 'Played'],
      [`${pct}%`, 'Survived'],
      [s.streak, 'Streak'],
      [s.maxStreak, 'Best'],
    ].map(([value, label]) => {
      const d = document.createElement('div');
      d.className = 'stat';
      d.append(
        Object.assign(document.createElement('b'), { textContent: String(value) }),
        Object.assign(document.createElement('span'), { textContent: label }),
      );
      return d;
    }),
  );

  const most = Math.max(1, ...s.bodyUsed);
  el('dist').replaceChildren(...s.bodyUsed.map((count, parts) => {
    const row = document.createElement('div');
    row.className = 'dist-row';
    if (count && count === most) row.classList.add('best');
    const bar = document.createElement('div');
    bar.className = 'dist-bar';
    bar.style.width = `${Math.max(8, (count / most) * 100)}%`;
    bar.textContent = String(count);
    row.append(
      Object.assign(document.createElement('span'), { textContent: String(parts) }),
      bar,
    );
    return row;
  }));

  el('stats-dialog').showModal();
}

/* ---------------------------------------------------------------- wiring */

document.addEventListener('keydown', (e) => {
  const open = document.querySelector('dialog[open]');
  if (open) return;                                 // dialogs handle their own keys
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (/^[a-zA-Z]$/.test(e.key)) {
    setPending(e.key.toLowerCase());
    e.preventDefault();
  } else if (e.key === 'Enter') {
    commit();
    e.preventDefault();
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    setPending(null);
    e.preventDefault();
  } else if (e.key === 'ArrowRight') {
    moveSelection(1);
    e.preventDefault();
  } else if (e.key === 'ArrowLeft') {
    moveSelection(-1);
    e.preventDefault();
  }
});

for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => btn.closest('dialog').close());
}

el('help-btn').addEventListener('click', () => el('help-dialog').showModal());
el('stats-btn').addEventListener('click', showStats);
dom.solveBtn.addEventListener('click', callTheWord);
dom.resultBtn.addEventListener('click', () => showEnd({ replay: true }));
dom.newBtn.addEventListener('click', openModes);
dom.dailyBtn.addEventListener('click', startDaily);

// "Play again" repeats the same settings; changing them is the New game sheet.
el('again-btn').addEventListener('click', () => {
  el('end-dialog').close();
  startPractice();
});
el('home-btn').addEventListener('click', () => {
  el('end-dialog').close();
  startDaily();
});

el('reset-stats').addEventListener('click', () => {
  resetStats();
  el('stats-dialog').close();
});

el('solve-dialog').addEventListener('close', (e) => {
  const dialog = e.target;
  if (dialog.returnValue !== 'submit') return;
  const word = el('solve-input').value.trim();
  if (word) submitCall(word);
});

el('share-btn').addEventListener('click', async () => {
  const text = shareText(view.game, { number: view.meta.number, url: location.href.split('?')[0] });
  const btn = el('share-btn');
  const ok = await copyToClipboard(text);
  const original = btn.textContent;
  btn.textContent = ok ? 'Copied' : 'Copy failed';
  setTimeout(() => { btn.textContent = original; }, 1400);
});

/* ---------------------------------------------------------------- modes */

const segments = { length: el('seg-length'), difficulty: el('seg-difficulty') };
let draft = { ...DEFAULT_PREFS };

function paintModeSheet() {
  for (const [key, group] of Object.entries(segments)) {
    for (const button of group.children) {
      button.setAttribute('aria-pressed', String(button.dataset.value === draft[key]));
    }
  }
  el('mode-note').textContent = MODES[draft.difficulty].note;
}

function openModes() {
  draft = { ...view.prefs };
  paintModeSheet();
  el('mode-dialog').showModal();
}

for (const [key, group] of Object.entries(segments)) {
  group.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    draft[key] = button.dataset.value;
    paintModeSheet();
  });
}

el('start-btn').addEventListener('click', () => {
  el('mode-dialog').close();
  startPractice({ ...draft });
});

/* ---------------------------------------------------------------- theme */

const THEME_KEY = 'hangdle:theme';
const THEME_COLOR = { light: '#f5f1e9', dark: '#0d0f13' };
const prefersLight = matchMedia('(prefers-color-scheme: light)');

function storedTheme() {
  const t = readRaw(THEME_KEY);
  return t === 'light' || t === 'dark' ? t : null;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLOR[theme];
  el('theme-btn').setAttribute(
    'aria-label',
    theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme',
  );
}

el('theme-btn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  writeRaw(THEME_KEY, next);
  applyTheme(next);
});

// Follow the system, but only while the player hasn't chosen for themselves.
prefersLight.addEventListener('change', () => {
  if (!storedTheme()) applyTheme(prefersLight.matches ? 'light' : 'dark');
});

// The inline head script already set the attribute; this syncs the label.
applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

// Keep the written rules in step with the constants, so tuning a track length
// can never leave the help text quietly lying about it.
for (const [selector, value] of [
  ['[data-max-body]', MAX_MISSES],
  ['[data-max-rope]', MAX_NEARS],
  ['[data-solve-penalty]', SOLVE_PENALTY],
]) {
  for (const node of document.querySelectorAll(selector)) node.textContent = String(value);
}

// First visit gets the rules unprompted — the two-track scoring needs explaining.
if (!readRaw('hangdle:seen')) {
  writeRaw('hangdle:seen', '1');
  el('help-dialog').showModal();
}

startDaily();
