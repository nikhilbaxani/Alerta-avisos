import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { encodeQr, qrPath } from "../lib/qr";

async function main() {
  const [text, ...extra] = process.argv.slice(2);
  if (!text || extra.length || !/^https?:\/\//i.test(text) || /\s/.test(text) || !URL.canParse(text)) {
    console.error("Uso: npx tsx scripts/qr-image.ts https://tu-dominio/llamar");
    process.exitCode = 1;
    return;
  }

  const { d, size } = qrPath(encodeQr(text, "M"));
  const svg = (pixels: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="Código QR para grabar una llamada de prueba">
  <rect width="${size}" height="${size}" fill="#fff"/>
  <path d="${d}" fill="#000"/>
</svg>`;

  const square = svg(Math.ceil(1200 / size) * size);
  const cardQr = svg(Math.floor(780 / size) * size);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
    await page.setContent(`<style>body { margin: 0; } svg { display: block; }</style>${square}`);
    const png = await page.locator("svg").screenshot();
    await page.setContent(`<!doctype html><html lang="es"><meta charset="utf-8"><style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #fff; color: #17212c; font: 32px system-ui, sans-serif; }
      main { width: 1080px; height: 1350px; padding: 95px 76px 76px; text-align: center; }
      h1 { margin: 0; font-size: 104px; line-height: 1.05; letter-spacing: -.04em; }
      .prompt { margin: 24px 0 12px; font-size: 44px; font-weight: 650; }
      svg { display: block; margin: auto; }
      .url { margin: 6px 0 0; font-size: 34px; font-weight: 600; overflow-wrap: anywhere; }
      .note { margin: 35px auto 0; max-width: 740px; font-size: 26px; color: #495461; line-height: 1.35; }
      </style><main>
        <h1>Agente 112</h1>
        <p class="prompt">Escanea y graba una llamada de prueba</p>
        ${cardQr}
        <p class="url"></p>
        <p class="note">Demo de hackathon. No es un servicio de emergencias. En una emergencia real, llama al 112.</p>
      </main></html>`);
    await page.locator(".url").evaluate((element, value) => { element.textContent = value; }, text);
    const card = await page.screenshot();

    await Promise.all([
      writeFile(new URL("../public/qr-llamar.svg", import.meta.url), `${square}\n`),
      writeFile(new URL("../public/qr-llamar.png", import.meta.url), png),
      writeFile(new URL("../public/qr-llamar-tarjeta.png", import.meta.url), card),
    ]);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
