/**
 * Validates the answer pools: every entry must be lowercase a-z and match the
 * length of the bucket it lives in. Run with --fix to drop bad entries, dedupe,
 * sort, and rewrite src/words.js.
 *
 *   node scripts/check-words.js
 *   node scripts/check-words.js --fix
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WORDS, LENGTHS } from '../src/words.js';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'src', 'words.js');
const fix = process.argv.includes('--fix');

const problems = [];
const cleaned = {};

for (const len of LENGTHS) {
  const seen = new Set();
  const keep = [];
  for (const word of WORDS[len]) {
    if (!/^[a-z]+$/.test(word)) {
      problems.push(`${len}: "${word}" is not lowercase a-z`);
      continue;
    }
    if (word.length !== len) {
      problems.push(`${len}: "${word}" is ${word.length} letters`);
      continue;
    }
    if (seen.has(word)) {
      problems.push(`${len}: "${word}" is a duplicate`);
      continue;
    }
    seen.add(word);
    keep.push(word);
  }
  cleaned[len] = keep.sort();
}

for (const p of problems) console.error(p);

if (!fix) {
  for (const len of LENGTHS) console.log(`${len} letters: ${cleaned[len].length} words`);
  if (problems.length) {
    console.error(`\n${problems.length} problem(s). Re-run with --fix to clean them out.`);
    process.exit(1);
  }
  console.log('\nAll clean.');
  process.exit(0);
}

const header = readFileSync(target, 'utf8').split('export const WORDS')[0];
const body = LENGTHS.map((len) => {
  const rows = [];
  for (let i = 0; i < cleaned[len].length; i += 9) {
    rows.push('    ' + cleaned[len].slice(i, i + 9).map((w) => `'${w}'`).join(', ') + ',');
  }
  return `  ${len}: [\n${rows.join('\n')}\n  ],`;
}).join('\n');

writeFileSync(target, `${header}export const WORDS = {\n${body}\n};\n\nexport const LENGTHS = [${LENGTHS.join(', ')}];\n`);
console.log(`Rewrote ${target}`);
for (const len of LENGTHS) console.log(`${len} letters: ${cleaned[len].length} words`);
