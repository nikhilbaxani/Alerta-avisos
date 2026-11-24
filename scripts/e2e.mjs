// Prueba extremo a extremo de la consola (requiere `npm run start -- -p 3112`).
import { chromium } from "playwright";
const url = process.argv[2] ?? "http://localhost:3112";
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
const fail = (m) => { console.error("FALLA:", m); process.exit(1); };
const banner = page.getByText(/¿La llamada .* es el mismo incidente/);

// Registra los elementos de audio para comprobar que el sonido avanza de verdad (no solo que el botón cambie).
await page.addInitScript(() => {
  const play = HTMLMediaElement.prototype.play;
  window.__audios = [];
  HTMLMediaElement.prototype.play = function () {
    window.__audios.push(this);
    return play.call(this);
  };
});
await page.goto(url);
await page.getByRole("button", { name: "Velocidad por 4" }).click();
await page.getByRole("button", { name: "Iniciar", exact: true }).click();
// El audio nunca suena solo: solo con «Escuchar».
await page.waitForTimeout(4000);
if (await page.evaluate(() => window.__audios.length)) fail("una llamada ha sonado sin pulsar Escuchar");
await page.getByRole("button", { name: "Velocidad por 10" }).click();

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
const kpi = async (pg, k) => Number(await pg.locator(`[data-kpi=${k}]`).getAttribute("data-value"));
if ((await kpi(page, "calls")) !== 26 || (await kpi(page, "incidents")) !== 7) fail(`contadores: ${await page.locator(".kpis").innerText()}`);

// Los incidentes se buscan por contenido (tipo, motivo y nº de llamadas), no por su número INC-xx:
// los números no se reutilizan y dependen de las decisiones del operador.
const prio = (name) => page.locator(".prio").getByRole("button", { name }).first();

// E1 en la cola de prioridad (la única emergencia médica, con dolor torácico): respuesta en árabe.
await prio(/Emergencia médica[\s\S]*dolor torácico/).click();
await page.getByRole("button", { name: "¿La persona respira? ¿Está consciente?" }).click();
const said = await page.locator(".said").innerText();
if (!/[؀-ۿ]/.test(said)) fail("la respuesta no está en árabe");
await page.getByRole("button", { name: "Reproducir al llamante" }).click();
await page.screenshot({ path: "docs/capturas/T19-arabe.png" });

// Agente de acciones (X05 en la consola): los avisos informativos ya se enviaron solos; el SMS en árabe espera al operador.
const sentBefore = await kpi(page, "actions");
if (sentBefore < 2) fail(`el agente no ha enviado los avisos automáticos (${sentBefore})`);
await page.getByRole("button", { name: /Aprobar y enviar: SMS en árabe/ }).click();
await page.locator("#box-actions").getByRole("button", { name: /Enviadas/ }).click();
await page.getByText(/Aprobado y enviado · acuse SMS-[0-9A-F]{6}/).first().waitFor({ timeout: 5000 });

// Audio de la llamada (sin red: MP3 dentro de la app).
for (const id of ["A1", "E1", "H1"]) {
  const r = await page.request.get(`${url}/audio/${id}.mp3`);
  if (r.status() !== 200 || !(r.headers()["content-type"] ?? "").includes("audio")) fail(`falta el audio ${id}`);
}
await page.getByRole("button", { name: "Escuchar la llamada E1" }).click();
await page.getByRole("button", { name: "Detener la llamada E1" }).waitFor({ timeout: 3000 });
await page.waitForFunction(() => window.__audios.some((a) => a.src.endsWith("/audio/E1.mp3") && !a.paused && !a.error && a.currentTime > 0.3), null, { timeout: 5000 })
  .catch(() => fail("el audio de E1 no suena (no avanza): ¿faltan los MP3 en public/audio?"));
await page.getByRole("button", { name: "Detener la llamada E1" }).click();
if ((await kpi(page, "actions")) !== sentBefore + 1) fail("aprobar el SMS no cuenta como acción enviada");

// ES-Alert (X07): lo propone el agente para la zona de los coches atrapados, pero solo lo aprueba un coordinador.
await page.locator("#box-actions").getByRole("button", { name: /Por aprobar/ }).click();
const es = page.locator(".act", { hasText: "ES-Alert a la población" });
if ((await es.count()) !== 1) fail("falta la tarjeta del ES-Alert en el coche de A");
if (await es.getByRole("button", { name: /Aprobar y enviar/ }).count()) fail("el operador no debe poder aprobar un ES-Alert");
if (!(await es.innerText()).includes("La aprueba un coordinador")) fail("el ES-Alert no avisa de que lo aprueba un coordinador");

// Separar una llamada del coche de A (6 llamadas; F es el otro vehículo, con 2).
await prio(/Vehículo atrapado por agua[\s\S]*6 llamadas/).click();
await page.getByRole("button", { name: "Separar llamada A6" }).click();
await page.waitForTimeout(300);
if ((await kpi(page, "incidents")) !== 8) fail("Separar no creó un incidente");

// Exportar registro (auditoría).
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar registro" }).click()]);
const log = JSON.parse(await (await import("node:fs/promises")).readFile(await dl.path(), "utf8"));
const kinds = new Set(log.eventos.map((e) => e.kind));
if (log.llamadas.length !== 26 || !kinds.has("operador_distinto") || !kinds.has("operador_mismo") || !kinds.has("separar")) fail("registro incompleto");
if (!kinds.has("accion_auto") || !kinds.has("accion_aprobada") || !log.accionesAgente?.length) fail("el registro no incluye las acciones del agente");

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
if ((await kpi(p2, "calls")) !== 16 || (await kpi(p2, "incidents")) !== 6) fail("apagón: contadores");
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
console.log("E2E OK: 26 llamadas → 7 incidentes, F1 y B2 preguntadas, árabe, acciones del agente, audio, Separar, sin errores de consola");
