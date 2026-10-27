// Prueba extremo a extremo de la consola (requiere `npm run start -- -p 3112`).
import { chromium } from "playwright";
const url = process.argv[2] ?? "http://localhost:3112";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
const fail = (m) => { console.error("FALLA:", m); process.exit(1); };
const banner = page.getByText(/¿La llamada .* es el mismo incidente/);

await page.goto(url);
await page.getByRole("button", { name: "Velocidad por 10" }).click();
await page.getByRole("button", { name: "Iniciar", exact: true }).click();

const asked = [];
for (let i = 0; i < 2; i++) {
  await banner.first().waitFor({ timeout: 45000 });
  const text = await banner.first().innerText();
  asked.push(text);
  // La zona gris nunca se resuelve sola: el reloj sigue y la decisión sigue pendiente.
  await page.waitForTimeout(1500);
  if (!(await banner.count())) fail("la zona gris se resolvió sin operador");
  await page.keyboard.press(text.includes("F1") ? "d" : "m");
  await page.waitForTimeout(300);
}
if (!asked[0].includes("F1") || !asked[1].includes("B2")) fail(`preguntas inesperadas: ${asked}`);
await page.getByText(/26 de 26/).waitFor({ timeout: 45000 });
await page.waitForTimeout(1500);
const counters = await page.locator(".counters").innerText();
if (!/26 llamadas → 7 incidentes/.test(counters.replace(/\s+/g, " "))) fail(`contadores: ${counters}`);

// E1 en la cola de prioridad: respuesta en árabe.
await page.getByRole("button", { name: /INC-05/ }).first().click();
await page.getByRole("button", { name: "¿La persona respira? ¿Está consciente?" }).click();
const said = await page.locator(".said").innerText();
if (!/[؀-ۿ]/.test(said)) fail("la respuesta no está en árabe");
await page.getByRole("button", { name: "Reproducir al llamante" }).click();
await page.screenshot({ path: "docs/capturas/T19-arabe.png" });

// Separar una llamada.
await page.getByRole("button", { name: /INC-01 ·/ }).first().click();
await page.getByRole("button", { name: "Separar llamada A6" }).click();
await page.waitForTimeout(300);
if (!/8 incidentes/.test((await page.locator(".counters").innerText()).replace(/\s+/g, " "))) fail("Separar no creó un incidente");

// Exportar registro (auditoría).
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar registro" }).click()]);
const log = JSON.parse(await (await import("node:fs/promises")).readFile(await dl.path(), "utf8"));
const kinds = new Set(log.eventos.map((e) => e.kind));
if (log.llamadas.length !== 26 || !kinds.has("operador_distinto") || !kinds.has("operador_mismo") || !kinds.has("separar")) fail("registro incompleto");

// Escenario 2: apagón (una sola pregunta, M1).
const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
p2.on("pageerror", (e) => errors.push(e.message));
await p2.goto(url);
await p2.getByLabel("Escenario", { exact: true }).selectOption("apagon-malaga");
await p2.getByRole("button", { name: "Velocidad por 10" }).click();
await p2.getByRole("button", { name: "Iniciar", exact: true }).click();
await p2.getByText(/¿La llamada M1 es el mismo incidente/).waitFor({ timeout: 30000 });
await p2.keyboard.press("d");
await p2.getByText(/16 de 16/).waitFor({ timeout: 30000 });
await p2.waitForTimeout(1500);
if (!/16 llamadas → 6 incidentes/.test((await p2.locator(".counters").innerText()).replace(/\s+/g, " "))) fail("apagón: contadores");
await p2.screenshot({ path: "docs/capturas/X01-apagon.png" });

// Inicio vacío y móvil sin scroll horizontal.
const empty = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await empty.goto(url);
await empty.getByText(/Pulsa Iniciar/).waitFor();
await empty.screenshot({ path: "docs/capturas/final-inicio.png" });
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto(url);
await mobile.getByRole("button", { name: "Velocidad por 10" }).click();
await mobile.getByRole("button", { name: "Iniciar", exact: true }).click();
await mobile.waitForTimeout(6000);
const over = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (over > 0) fail(`scroll horizontal en móvil: ${over}px`);

await browser.close();
if (errors.length) fail("errores de consola: " + errors.join(" | "));
console.log("E2E OK: 26 llamadas → 7 incidentes, F1 y B2 preguntadas, árabe, Separar, sin errores de consola");
