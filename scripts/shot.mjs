// Uso: node scripts/shot.mjs <tarea> [url]  → docs/capturas/<tarea>-{escritorio,movil}-{decision,final}.png
import { chromium } from "playwright";

const tag = process.argv[2] ?? "shot";
const url = process.argv[3] ?? "http://localhost:3112";
const browser = await chromium.launch();
const errors = [];
for (const [name, viewport] of [["escritorio", { width: 1440, height: 900 }], ["movil", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport });
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(url);
  await page.getByRole("button", { name: "Velocidad por 10" }).click();
  await page.getByRole("button", { name: "Iniciar", exact: true }).click();
  await page.getByText(/¿La llamada .* es el mismo incidente/).first().waitFor({ timeout: 40000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `docs/capturas/${tag}-${name}-decision.png`, fullPage: name === "movil" });
  // Resolver las decisiones con el teclado (M / D) y llegar al final.
  await page.keyboard.press("d");
  await page.waitForTimeout(500);
  for (let i = 0; i < 20; i++) {
    if (await page.getByText(/¿La llamada .* es el mismo incidente/).count()) { await page.keyboard.press("m"); }
    if (await page.getByText("Continuar").count() === 0 && (await page.getByText(/T\+05:3\d|T\+05:4\d|T\+0[6-9]/).count())) break;
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `docs/capturas/${tag}-${name}-final.png`, fullPage: name === "movil" });
  await page.getByRole("button", { name: "Centro", exact: true }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `docs/capturas/${tag}-${name}-centro.png`, fullPage: name === "movil" });
  await page.close();
}
await browser.close();
console.log(errors.length ? "ERRORES DE CONSOLA:\n" + errors.join("\n") : "Sin errores de consola");
