/**
 * Render icons/icon.svg to the PNGs a home screen actually needs.
 *
 *   node scripts/icons.js
 *
 * PNG rather than SVG because iOS ignores an SVG apple-touch-icon, and ignores
 * a data: URI for one too — it wants a real file at a real path. The sizes are
 * the ones that matter: 180 for iOS, 192 and 512 for Android and Chrome.
 *
 * Needs playwright available; the repo itself has no dependencies, so the PNGs
 * are committed and this only needs running when the artwork changes.
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icons = join(root, 'icons');
mkdirSync(icons, { recursive: true });

const SIZES = [
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
];

// No tiny PNG favicon: Chromium refuses to screenshot a viewport that small,
// and it isn't needed — icon.svg serves modern browsers as the favicon and
// icon-192.png is the fallback for anything that can't take an SVG.

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

for (const { file, size } of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.goto(`file://${join(icons, 'icon.svg')}`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(icons, file) });
  await page.close();
  console.log(`icons/${file} — ${size}×${size}`);
}

await browser.close();
