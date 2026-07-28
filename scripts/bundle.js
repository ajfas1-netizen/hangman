/**
 * Builds the whole game into one self-contained HTML file: dist/hangdle.html.
 *
 *   node scripts/bundle.js
 *
 * The game already has no dependencies and no build step, so this exists only
 * for places that want a single file — a share link, an artifact host, an email
 * attachment, anywhere a folder of modules is awkward.
 *
 * The modules are concatenated rather than truly bundled, which is safe here for
 * one specific reason: there is a single dependency chain with no cycles and no
 * duplicate top-level names across files. Adding a module means adding it to
 * ORDER below, in dependency order. If two modules ever declare the same
 * top-level name this will break loudly at parse time, which is the failure mode
 * you want.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** Dependency order: each file may only use names declared above it. */
const ORDER = [
  'src/words.js',
  'src/engine.js',
  'src/daily.js',
  'src/storage.js',
  'src/share.js',
  'src/score.js',
  'src/main.js',
];

/*
 * Forgetting to list a module here silently drops it: the real page still works
 * because its imports resolve, while the bundle ships with the names undefined
 * and dies on first use. Refuse to build instead.
 */
const listed = new Set(ORDER.map((f) => f.replace('src/', '')));
const missing = readdirSync(join(root, 'src')).filter((f) => f.endsWith('.js') && !listed.has(f));
if (missing.length) {
  throw new Error(`src/${missing.join(', src/')} not listed in ORDER — add it in dependency order`);
}

/** Drop the module plumbing; everything ends up in one scope. */
function flatten(source) {
  return source
    .replace(/^import[\s\S]*?from\s*['"][^'"]*['"];?[ \t]*$/gm, '')
    .replace(/^export\s+(?=const|function|class|let|async)/gm, '')
    .trimStart();
}

const html = read('index.html');
const css = read('styles.css');

// The theme initialiser lives in <head> and must keep running before paint.
const headScript = (html.match(/<head>[\s\S]*?<script>([\s\S]*?)<\/script>/) ?? [])[1] ?? '';
if (!headScript.trim()) throw new Error('theme init script not found in <head>');

const body = html
  .match(/<body[^>]*>([\s\S]*)<\/body>/)[1]
  .replace(/<script type="module"[^>]*><\/script>/, '')
  .trim();

const js = ORDER.map((file) => `/* ---- ${file} ---- */\n${flatten(read(file))}`).join('\n\n');

/* Hosts that supply their own document skeleton (artifact pages, CMS embeds)
   reject a nested <html>/<head>/<body>, so --fragment emits the same page
   without the wrapper. The <style> and the pre-paint theme script still work
   from inside the body. */
if (process.argv.includes('--fragment')) {
  const fragment = `<title>Hangdle</title>
<style>
${css}
</style>
<script>${headScript}</script>

${body}

<script type="module">
${js}
</script>
`;
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist', 'hangdle.fragment.html'), fragment);
  console.log(`dist/hangdle.fragment.html — ${(fragment.length / 1024).toFixed(0)} KB`);
  process.exit(0);
}

const out = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Hangman crossed with Wordle. Guess the letter — and the slot it sits in.">
<meta name="theme-color" content="#0d0f13">
<title>Hangdle</title>
<style>
${css}
</style>
<script>${headScript}</script>
</head>
<body>
${body}

<script type="module">
${js}
</script>
</body>
</html>
`;

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'hangdle.html'), out);
console.log(`dist/hangdle.html — ${(out.length / 1024).toFixed(0)} KB`);
