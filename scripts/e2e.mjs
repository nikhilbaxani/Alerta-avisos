// Prueba de la consola. Para probar ambos modos y renovar pestanas-*.png, arranca
// en modo simulado con NEXT_PUBLIC_RELAY_URL=/relay y ejecuta con T8_CAPTURES=1.
// E2E_CAPTURE_DIR guarda capturas de diagnóstico fuera del repositorio.
// E2E_CHROMIUM_PATH permite usar un Chromium ya disponible.
import { chromium } from "playwright";
const url = process.argv[2] ?? "http://localhost:3112";
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required"],
  executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
});
const captureDir = process.env.E2E_CAPTURE_DIR;
const capture = (page, name) => captureDir && page.screenshot({ path: `${captureDir}/${name}.png` });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const watchErrors = (pg) => {
  pg.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  pg.on("pageerror", (e) => errors.push(e.message));
};
watchErrors(page);
const fail = (m) => { console.error("FALLA:", m); process.exit(1); };
const banner = page.getByText(/¿La llamada .* es el mismo incidente/);
const kpi = async (pg, k) => Number(await pg.locator(`[data-kpi=${k}]`).getAttribute("data-value"));

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
  if (i === 1 && captureDir) {
    await page.locator('.agent-feed .feed-item').first().waitFor({ timeout: 5000 });
    await capture(page, "simulacion-acciones");
  }
}
if (!asked[0].includes("F1") || !asked[1].includes("B2")) fail(`preguntas inesperadas: ${asked}`);
await page.getByText(/26 de 26/).waitFor({ timeout: 45000 });
await page.waitForTimeout(1500);
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
await capture(page, "T19-arabe");

// Agente de acciones (X05 en la consola): los avisos informativos ya se enviaron solos; el SMS en árabe espera al operador.
const sentBefore = await kpi(page, "actions");
if (sentBefore < 2) fail(`el agente no ha enviado los avisos automáticos (${sentBefore})`);
await page.getByRole("button", { name: /Aprobar y enviar: SMS en árabe/ }).click();
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
await prio(/Vehículo atrapado por agua[\s\S]*6 llamadas/).click();
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
watchErrors(p2);
await p2.goto(url);
await p2.getByLabel("Escenario", { exact: true }).selectOption("apagon-malaga");
await p2.getByRole("button", { name: "Velocidad por 10" }).click();
await p2.getByRole("button", { name: "Iniciar", exact: true }).click();
await p2.getByText(/¿La llamada M1 es el mismo incidente/).waitFor({ timeout: 30000 });
await p2.keyboard.press("d");
await p2.getByText(/16 de 16/).waitFor({ timeout: 30000 });
await p2.waitForTimeout(1500);
if ((await kpi(p2, "calls")) !== 16 || (await kpi(p2, "incidents")) !== 6) fail("apagón: contadores");
await capture(p2, "X01-apagon");

// Inicio vacío y móvil sin scroll horizontal.
const empty = await browser.newPage({ viewport: { width: 1440, height: 900 } });
watchErrors(empty);
await empty.goto(url);
await empty.getByText(/Pulsa Iniciar/).waitFor();
await capture(empty, "final-inicio");
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
watchErrors(mobile);
await mobile.goto(url);
await mobile.getByRole("button", { name: "Velocidad por 10" }).click();
await mobile.getByRole("button", { name: "Iniciar", exact: true }).click();
await mobile.waitForTimeout(6000);
const over = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (over > 0) fail(`scroll horizontal en móvil: ${over}px`);

const simTab = (pg) => pg.getByRole("tab", { name: "Simulación", exact: true });
const liveTab = (pg) => pg.getByRole("tab", { name: "En directo (QR)", exact: true });
const captureTabs = process.env.T8_CAPTURES === "1";
if (await liveTab(empty).isDisabled()) {
  if (captureTabs) fail("las capturas requieren NEXT_PUBLIC_RELAY_URL=/relay");
  await empty.getByText("En directo no disponible: falta configurar el relay del VPS.", { exact: true }).waitFor();
  if ((await simTab(empty).getAttribute("aria-selected")) !== "true") fail("Simulación no es la vista inicial");
  if (await empty.locator(".inbox").count()) fail("bandeja visible sin relay");
  const sameRow = await empty.evaluate(() => {
    const playback = document.querySelector(".playback").getBoundingClientRect();
    const end = document.querySelector(".topbar-end").getBoundingClientRect();
    return end.top < playback.bottom && playback.top < end.bottom;
  });
  if (!sameRow) fail("la barra superior ocupa más de una fila en escritorio sin relay");
  console.log("T8 OK: En directo (QR) desactivada con aviso sin relay");
} else {
  const sample = {
    id: "P1", receivedAt: "2026-11-24T11:13:00Z", durationS: 14, language: "es",
    transcript: "Hay un coche atrapado por el agua en Campanillas.", translation_en: null,
    extraction: {
      language: "es", translation_es: null, summary_es: "Coche atrapado en Campanillas",
      incident_type: "inundacion_vehiculo", location_text: "Campanillas", keywords: ["coche", "agua"],
      risks: ["atrapados"], people_at_risk: 1, severity: 5,
    },
    location: { place: "Campanillas", known: true, aml: { lat: 36.716, lng: -4.548, acc: 150 } },
    timings: { sttMs: 1200, totalMs: 1400 },
  };
  for (const [width, height, suffix] of [[1440, 900, ""], [390, 844, "-movil"]]) {
    const pg = await browser.newPage({ viewport: { width, height } });
    watchErrors(pg);
    await pg.route("**/relay/events?*", (route) => route.fulfill({
      contentType: "text/event-stream",
      body: [sample, { ...sample, id: "P2" }].map((event) => `event: call\ndata: ${JSON.stringify(event)}\n\n`).join(""),
    }));
    const fixtureUrl = new URL(url);
    fixtureUrl.hash = "op=fixture";
    await pg.goto(fixtureUrl.href);
    const scenario = pg.getByLabel("Escenario", { exact: true });
    await scenario.selectOption("apagon-malaga");
    await pg.getByRole("button", { name: "Velocidad por 10" }).click();
    await pg.getByRole("button", { name: "Iniciar", exact: true }).click();
    await pg.waitForFunction(() => Number(document.querySelector('[data-kpi=calls]')?.getAttribute('data-value')) > 0);
    await pg.getByRole("button", { name: "Pausar", exact: true }).click();
    const simCalls = await kpi(pg, "calls");
    const simTime = await pg.locator(".clock").innerText();
    if (await pg.locator(".inbox").isVisible()) fail("bandeja visible en Simulación");
    if (await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)) fail(`scroll horizontal en Simulación (${width}px)`);
    if (captureTabs) await pg.screenshot({ path: `docs/capturas/pestanas-simulacion${suffix}.png` });

    await simTab(pg).focus();
    await pg.keyboard.press("ArrowRight");
    if ((await liveTab(pg).getAttribute("aria-selected")) !== "true") fail("no se puede abrir En directo con el teclado");
    await pg.getByRole("img", { name: /Código QR que abre .*\/llamar/ }).waitFor();
    const accept = pg.getByRole("button", { name: "Aceptar llamada P1" });
    await accept.waitFor();
    if (await scenario.count() || await pg.locator(".playback, .clock").count()) fail("controles de simulación visibles en En directo");
    if (await pg.locator("[data-kpi=actions], .agent-feed").count() || await pg.getByRole("button", { name: "Sonido de las llamadas" }).count()) fail("acciones o audio del escenario visibles en En directo");
    if (await kpi(pg, "calls") || await kpi(pg, "incidents") || await pg.locator(".marker").count()) fail("llamadas sin aceptar en el mapa o en los contadores");
    await pg.getByRole("button", { name: "Descartar llamada P2" }).click();
    if (await kpi(pg, "calls") || await kpi(pg, "incidents")) fail("descartar modificó la cola o los incidentes");
    await simTab(pg).click();
    if (await scenario.inputValue() !== "apagon-malaga" || await kpi(pg, "calls") !== simCalls || await pg.locator(".clock").innerText() !== simTime) fail("no se conservó el estado de Simulación");
    await liveTab(pg).click();
    await accept.click();
    if (await kpi(pg, "calls") !== 1 || await kpi(pg, "incidents") !== 1 || await pg.locator(".marker").count() !== 1) fail("aceptar no creó la llamada y el incidente en En directo");
    if (await pg.getByRole("button", { name: "Descartar llamada P2" }).count()) fail("volvió la llamada descartada");
    await simTab(pg).click();
    if (await kpi(pg, "calls") !== simCalls) fail("una llamada por QR contaminó Simulación");
    await liveTab(pg).click();
    if (await kpi(pg, "calls") !== 1 || await kpi(pg, "incidents") !== 1) fail("no se conservó el estado de En directo");
    if (await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)) fail(`scroll horizontal en En directo (${width}px)`);
    if (captureTabs) await pg.screenshot({ path: `docs/capturas/pestanas-directo${suffix}.png` });
    await pg.close();
  }
  console.log("T8 OK: QR con SSE simulado, moderación y estado aislado en escritorio y móvil");
}

await browser.close();
if (errors.length) fail("errores de consola: " + errors.join(" | "));
console.log("E2E OK: DANA 26 → 7, Apagón 16 → 6, zona gris, árabe, acciones del agente, audio, Separar, sin errores de consola");
