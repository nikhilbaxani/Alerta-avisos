// Run from the repository root. Uses the project's installed Playwright browser.
// SVG stays interactive; exported images capture the entrance and a resting hold.
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const output = process.argv[2] || '/tmp/avance-112-frames';
const width = 1100, height = 300, fps = 25, frames = 120;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width, height: height + 20 } });
  const svg = await readFile(join(root, 'avance-112-animado.svg'), 'utf8');
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
  await page.mouse.move(width - 1, height + 10);
  await page.evaluate(() => {
    window.frameAnimations = document.getAnimations();
    for (const a of window.frameAnimations) { a.pause(); a.currentTime = 0; }
  });
  for (let i = 0; i < frames; i++) {
    await page.evaluate(time => {
      for (const a of window.frameAnimations) a.currentTime = time;
    }, i * 1000 / fps);
    await page.screenshot({ path: join(output, `frame-${String(i).padStart(4, '0')}.png`),
      omitBackground: true, clip: { x: 0, y: 0, width, height } });
    if (i % 40 === 0) console.log(`Fotogramas: ${i}/${frames}`);
  }
  await writeFile(join(output, 'frames.json'), JSON.stringify({ width, height, fps, frames,
    duration_ms: frames * 1000 / fps, alpha: true }, null, 2));
  console.log(`Exportados ${frames} fotogramas transparentes.`);
} finally {
  await browser.close();
}
