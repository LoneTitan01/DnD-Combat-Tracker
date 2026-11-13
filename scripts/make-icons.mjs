// Renders the PWA PNG icons from public/icon.svg using the system's Edge (or PW_CHANNEL).
// Run with: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf-8');
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
const page = await browser.newPage();

async function render(file, size, { maskable = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  // Maskable icons need a full-bleed background with the artwork inside the central 80% safe zone.
  const inner = maskable ? Math.round(size * 0.7) : size;
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${
    maskable ? '#1c1917' : 'transparent'
  }"><div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
  await page.screenshot({ path: `public/${file}`, omitBackground: !maskable });
  console.log(`public/${file}`);
}

await render('icon-192.png', 192);
await render('icon-512.png', 512);
await render('icon-maskable-512.png', 512, { maskable: true });
await render('apple-touch-icon.png', 180, { maskable: true });
await browser.close();
