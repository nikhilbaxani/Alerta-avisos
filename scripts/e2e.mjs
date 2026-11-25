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
const captureTabs = process.env.T8_CAPTURES === "1";
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
  if (i === 1 && captureDir) {
    await page.locator('.agent-feed .feed-item').first().waitFor({ timeout: 5000 });
    await capture(page, "simulacion-acciones");
  }
}
if (!asked[0].includes("F1") || !asked[1].includes("B2")) fail(`preguntas inesperadas: ${asked}`);
await page.getByText(/27 de 27/).waitFor({ timeout: 45000 });
await page.waitForTimeout(1500);
if ((await kpi(page, "calls")) !== 27 || (await kpi(page, "incidents")) !== 7) fail(`contadores: ${await page.locator(".kpis").innerText()}`);

// eCall (X13): EC1 aparece en la cola como eCall y queda en el mismo incidente que A1 (no en el de F1).
const qCall = (id) => page.locator(`#box-incoming [data-call="${id}"]`).first();
const ec1 = page.locator('#box-incoming [data-call="EC1"][data-channel="ecall"]');
if ((await ec1.count()) !== 1) fail("la eCall EC1 no aparece en la cola como eCall");
const ecInc = await ec1.getAttribute("data-incident");
if (!ecInc || ecInc !== (await qCall("A1").getAttribute("data-incident"))) fail(`EC1 no queda en el incidente de A1 (${ecInc})`);
if (ecInc === (await qCall("F1").getAttribute("data-incident"))) fail("EC1 se ha juntado con el coche de F1");
if (!(await ec1.innerText()).includes("eCall")) fail("la eCall no se rotula como eCall en la cola");

// Agente de espera (X11): la caja aparece, el asistente atiende llamadas en la DANA y E1 sale escalada.
// Entrantes, En espera y Perdidas son pestañas de una misma caja (#box-calls).
if ((await page.locator("#box-calls [role=tab]").count()) !== 3) fail("la caja de llamadas no tiene las tres pestañas");
if (await page.locator("#box-waiting").isVisible()) fail("la pestaña En espera se ve sin elegirla");
await page.locator("#tab-waiting").click();
const wait = page.locator("#box-waiting");
await wait.waitFor({ timeout: 5000 });
if (await page.locator("#box-incoming").isVisible()) fail("al elegir En espera siguen a la vista las entrantes");
if (!(await wait.innerText()).includes("Simulación con supuestos declarados")) fail("la caja En espera no se rotula como simulación");
const waitNum = async (k) => Number(await wait.locator(`[data-wait=${k}]`).innerText());
for (const ops of ["1 operador", "2 operadores"]) {
  await wait.getByRole("button", { name: ops, exact: true }).click();
  if ((await waitNum("attended")) < 1) fail(`con ${ops}, el asistente no atiende ninguna llamada`);
  if ((await wait.locator('[data-call="E1"]').getAttribute("data-outcome")) !== "escalada") fail(`con ${ops}, E1 no sale escalada`);
}
if (!(await wait.locator('[data-call="E1"]').innerText()).includes("Escalada")) fail("E1 escalada sin aviso visible");
await page.locator("#tab-incoming").click();

// Los incidentes se buscan por contenido (tipo, motivo y nº de llamadas), no por su número INC-xx:
// los números no se reutilizan y dependen de las decisiones del operador.
const prio = (name) => page.locator(".prio").getByRole("button", { name }).first();

// E1 en la cola de prioridad (la única emergencia médica, con dolor torácico): respuesta en árabe.
await prio(/Emergencia médica[\s\S]*dolor torácico/).click();
// «Falta saber» (X12): la guía pide si respira; el clic la prepara en árabe, sin reproducirla sola.
const det = page.locator("#box-detail");
const respira = det.locator('[data-missing="respira"]');
await respira.waitFor({ timeout: 3000 }).catch(() => fail("E1 no muestra «Falta saber: si respira»"));
if (!(await det.innerText()).includes("la IA no decide")) fail("«Falta saber» no se rotula como guía");
const spoken = await page.evaluate(() => window.speechSynthesis?.speaking ?? false);
await respira.click();
const box = page.locator("#box-translate .said-box");
if ((await box.getAttribute("data-phrase")) !== "respira") fail("el clic en «Falta saber» no prepara la frase respira");
if (!(await box.locator(".said").innerText()).includes("هل الشخص يتنفس")) fail("la pregunta de respirar no sale en árabe");
if ((await respira.getAttribute("aria-pressed")) !== "true") fail("«Falta saber» no marca la pregunta preparada");
if (!spoken && (await page.evaluate(() => window.speechSynthesis?.speaking ?? false))) fail("«Falta saber» reproduce sin que lo pulse el operador");
await page.getByRole("button", { name: "¿La persona respira? ¿Está consciente?" }).click();
const said = await page.locator(".said").innerText();
if (!/[؀-ۿ]/.test(said)) fail("la respuesta no está en árabe");
await page.getByRole("button", { name: "Reproducir al llamante" }).click();
await capture(page, "T19-arabe");

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

// Aviso de duplicado (X14): al aprobar los bomberos del coche de A (INC-01), el agente prepara el lote para
// quien volvió a llamar; «Aprobar todos» lo envía. A4 (trajo «menor») queda aparte y EC1 (eCall) no recibe nada.
const acts = page.locator("#box-actions");
await acts.getByRole("button", { name: "Todas", exact: true }).click().catch(() => {});
const bomA = acts.locator('.act[data-tool="proponer_recursos"][data-incident="INC-01"]', { hasText: "Enviar Bomberos" });
// Unidades simuladas (X16): antes de aprobar, la tarjeta propone la unidad libre más cercana.
const bomUnit = bomA.locator("[data-unit]");
if (!(await bomUnit.count()) || !(await bomUnit.innerText()).includes("Unidad libre más cercana")) fail("la tarjeta de bomberos de A no propone la unidad libre más cercana");
const unitId = await bomUnit.getAttribute("data-unit");
await bomA.getByRole("button", { name: /Aprobar y enviar/ }).click();
// …y al aprobar, esa unidad sale en el mapa asignada a INC-01, con su línea hacia el incidente.
const mapUnit = page.locator(`svg.map g[data-unit="${unitId}"][data-incident="INC-01"]`);
await mapUnit.waitFor({ state: "attached", timeout: 3000 }).catch(() => fail(`la unidad ${unitId} no aparece asignada a INC-01 en el mapa`));
if ((await mapUnit.getAttribute("data-status")) === "libre") fail("la unidad asignada sigue libre en el mapa");
if (!(await page.locator(`svg.map [data-unit-line="${unitId}"]`).count())) fail("falta la línea de la unidad al incidente");
if ((await page.locator("svg.map g[data-unit][data-status=libre][data-incident]").count())) fail("una unidad libre lleva incidente");
// Peligros en la vía (X17, simulación): marcas propias en el mapa y aviso cruzado en la tarjeta de la unidad
// (B-2 hacia INC-01 pasaría por la vía inundada de otro incidente). Solo aviso: sin botones que cambien rutas.
const hazardsN = await page.locator("svg.map g[data-hazard][data-kind][data-incident]").count();
if (!hazardsN) fail("no hay peligros en la vía en el mapa de la DANA");
if ((await page.locator('svg.map g[data-hazard][data-kind="agua_en_via"]').count()) < 2) fail("faltan los peligros de agua en la vía (paso inferior de A y vía inundada)");
if (!(await page.locator(`svg.map g[data-unit="${unitId}"][data-hazard-warning]`).count())) fail("la unidad afectada no se marca en el mapa");
const lote = acts.locator('[data-batch="INC-01"]');
await lote.waitFor({ timeout: 5000 }).catch(() => fail("no aparece el lote de avisos de duplicado de INC-01"));
const loteText = await lote.innerText();
if (loteText.includes("EC1") || loteText.includes("A4")) fail(`el lote incluye a quien no debe: ${loteText}`);
for (const id of ["A2", "A3", "A5"]) if (!loteText.includes(id)) fail(`al lote de INC-01 le falta ${id}`);
const a4 = acts.locator('.act[data-tool="sms_duplicado"][data-incident="INC-01"][data-status="propuesta"]', { hasText: "+34 6•• ••• 519" });
if (!(await a4.count()) || !(await a4.innerText()).includes("información nueva")) fail("A4 (información nueva) no sale aparte y marcada");
await lote.getByRole("button", { name: /Aprobar todos/ }).click();
await page.waitForTimeout(300);
if (await lote.count()) fail("el lote sigue pendiente tras «Aprobar todos»");
await acts.getByRole("button", { name: /Enviadas/ }).click();
const sentDup = acts.locator('.act[data-tool="sms_duplicado"][data-incident="INC-01"][data-status="enviada"]');
if ((await sentDup.count()) !== 3) fail(`el lote no pasa a enviada (${await sentDup.count()} de 3)`);
if (!(await sentDup.first().innerText()).match(/Aprobado en lote y enviado · acuse DUP-[0-9A-F]{6}/)) fail("el aviso enviado no dice que se aprobó en lote");
const bomSent = acts.locator(`.act[data-tool="proponer_recursos"][data-incident="INC-01"][data-status="enviada"] [data-unit="${unitId}"]`);
if (!(await bomSent.count()) || !(await bomSent.innerText()).includes(`Unidad asignada: ${unitId}`)) fail("la tarjeta enviada de bomberos no muestra la unidad asignada");
const hzWarn = acts.locator('.act[data-tool="proponer_recursos"][data-incident="INC-01"] .act-unit [data-hazard-warning][data-hazard-incident]');
await hzWarn.first().waitFor({ timeout: 3000 }).catch(() => fail("la tarjeta de bomberos de A no avisa del peligro en la vía"));
const hzText = await hzWarn.first().innerText();
if (!hzText.includes(`${unitId} pasaría por`) || !/de INC-\d+/.test(hzText) || !hzText.includes("simulación")) fail(`aviso de peligro inesperado: ${hzText}`);
if (await hzWarn.locator("button").count()) fail("el aviso de peligro no debe llevar botones");
const hzInc = await hzWarn.first().getAttribute("data-hazard-incident");
if (hzInc === "INC-01") fail("el aviso cruzado es del propio incidente de destino");
if (!(await page.locator(`svg.map g[data-hazard][data-incident="${hzInc}"][data-warned]`).count())) fail("el peligro afectado no se marca en el mapa");
await acts.getByRole("button", { name: /Por aprobar/ }).click();

// Llamadas perdidas (X15): las desconocidas (P3, P4) arriba con «devolver la llamada»; los probables
// duplicados (P1, P2, P5) debajo. P1 (francés, junto a A) ya tiene su SMS de duplicado tras aprobar los
// bomberos de A. Nada se envía sin clic: aprobar P3 cambia su estado.
await page.locator("#tab-lost").click();
const lostBox = page.locator("#box-lost");
await lostBox.waitFor({ timeout: 5000 }).catch(() => fail("no aparece la caja Llamadas perdidas"));
const lostText = await lostBox.innerText();
const lostHelp = await lostBox.locator(".wait-foot").textContent();
if (!lostText.includes("Simulación") || !lostHelp.includes("10.000") || !lostHelp.includes("fuente: 112 autonómicos / prensa")) fail("la caja de perdidas no se rotula como simulación con la cifra y su fuente");
if (lostText.indexOf("Devolver primero") > lostText.indexOf("Probables duplicados")) fail("las desconocidas no van por delante de los duplicados");
for (const [id, kind] of [["P3", "unknown"], ["P4", "unknown"], ["P1", "duplicate"], ["P2", "duplicate"], ["P5", "duplicate"]]) {
  if ((await lostBox.locator(`[data-lost="${id}"][data-kind="${kind}"]`).count()) !== 1) fail(`${id} no sale como ${kind} en Llamadas perdidas`);
}
const p3 = lostBox.locator('[data-lost="P3"][data-kind="unknown"]');
if ((await p3.locator('[data-state="pending"]').count()) !== 1 || !(await p3.innerText()).includes("Devolver la llamada")) fail("P3 no propone devolver la llamada pendiente del operador");
const p1 = lostBox.locator('[data-lost="P1"][data-kind="duplicate"]');
if ((await p1.locator('[data-state="pending"]').count()) !== 1 || !(await p1.innerText()).includes("Aviso de duplicado en francés")) fail("P1 no propone el SMS de duplicado en francés");
if ((await acts.locator('.act[data-tool="devolver_llamada"][data-status="propuesta"]', { hasText: "Llamada perdida P3" }).count()) !== 1) fail("la devolución de P3 no aparece en Acciones");
await p3.getByRole("button", { name: /Aprobar y enviar: .*llamada perdida P3/ }).click();
await p3.locator('[data-state="sent"]').waitFor({ timeout: 3000 }).catch(() => fail("aprobar la devolución de P3 no cambia su estado"));
if (!(await p3.innerText()).includes("aprobada y enviada")) fail("P3 enviada no lo dice");
if ((await p1.locator('[data-state="pending"]').count()) !== 1) fail("aprobar P3 ha enviado también el SMS de P1");

// Separar una llamada del coche de A (6 llamadas y la eCall EC1; F es el otro vehículo, con 2).
await prio(/Vehículo atrapado por agua[\s\S]*7 llamadas/).click();
// La tarjeta de la eCall enseña sus datos y no ofrece «Escuchar»: es un mensaje de datos, sin voz.
const ecCard = page.locator('#box-detail [data-callcard="EC1"][data-channel="ecall"]');
if ((await ecCard.count()) !== 1) fail("el detalle del coche de A no muestra la eCall EC1");
const ecText = await ecCard.innerText();
for (const k of ["Mensaje de datos (sin voz)", "Activación", "Ocupantes", "Dirección de marcha", "Posición"]) if (!ecText.includes(k)) fail(`a la tarjeta de EC1 le falta «${k}»`);
if (await page.getByRole("button", { name: "Escuchar la llamada EC1" }).count()) fail("la eCall ofrece «Escuchar» y no tiene voz");
await page.getByRole("button", { name: "Separar llamada A6" }).click();
await page.waitForTimeout(300);
if ((await kpi(page, "incidents")) !== 8) fail("Separar no creó un incidente");

// Exportar registro (auditoría).
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar registro" }).click()]);
const log = JSON.parse(await (await import("node:fs/promises")).readFile(await dl.path(), "utf8"));
const kinds = new Set(log.eventos.map((e) => e.kind));
if (log.llamadas.length !== 27 || !kinds.has("operador_distinto") || !kinds.has("operador_mismo") || !kinds.has("separar")) fail("registro incompleto");
if (!kinds.has("accion_auto") || !kinds.has("accion_aprobada") || !log.accionesAgente?.length) fail("el registro no incluye las acciones del agente");
if (log.accionesAgente.filter((a) => a.herramienta.nombre === "sms_duplicado" && a.aprobacion?.lote && a.resultado.estado === "enviada").length !== 3) fail("el registro no incluye el lote de avisos de duplicado");

// Incidencia solucionada → archivo → reabrir. Con confirmación en dos pasos.
const before = await kpi(page, "incidents");
await prio(/Árbol caído/).click();
const resolveBtn = page.locator("#box-detail").getByRole("button", { name: /Marcar INC-\d+ como solucionada/ });
const solvedId = (await resolveBtn.getAttribute("aria-label")).match(/INC-\d+/)[0];
await resolveBtn.click();
await page.locator("#box-detail").getByRole("button", { name: `Confirmar: ${solvedId} solucionada` }).click();
await page.waitForTimeout(300);
if ((await kpi(page, "incidents")) !== before - 1) fail("solucionar no quita el incidente de los abiertos");
if (await page.getByRole("button", { name: new RegExp(`^${solvedId},`) }).count()) fail("el incidente solucionado sigue en el mapa");
await page.getByRole("button", { name: /Incidencias archivadas \(1\)/ }).click();
const drawer = page.locator("dialog.drawer");
await drawer.getByText(solvedId).first().waitFor({ timeout: 3000 });
if (!(await drawer.innerText()).includes("Acciones del agente")) fail("el archivo no muestra las acciones");
await drawer.getByRole("button", { name: "Reabrir" }).click();
await page.waitForTimeout(300);
if ((await kpi(page, "incidents")) !== before) fail("reabrir no devuelve el incidente");

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
  for (const [width, height] of [[1440, 900], [1370, 900], [390, 844]]) for (const theme of ["light", "dark"]) {
    const pg = await browser.newPage({ viewport: { width, height } });
    await pg.addInitScript((theme) => localStorage.setItem("theme", theme), theme);
    watchErrors(pg);
    await pg.route("**/relay/events?*", (route) => route.fulfill({
      contentType: "text/event-stream",
      body: [sample, { ...sample, id: "P2" }].map((event) => `event: call\ndata: ${JSON.stringify(event)}\n\n`).join(""),
    }));
    await pg.route("**/relay/events/ack", (route) => route.fulfill({ status: 200, json: { ok: true } }));
    const fixtureUrl = new URL(url);
    fixtureUrl.hash = "op=fixture";
    await pg.goto(fixtureUrl.href);
    await pg.locator(`html[data-theme=${theme}]`).waitFor();
    await pg.evaluate(() => document.fonts.ready.then(() => undefined));
    if (width >= 1370 && !(await pg.locator(".topbar").evaluate((bar) => {
      const playback = bar.querySelector(".playback").getBoundingClientRect();
      // Solo un logo ocupa espacio: la otra variante temática tiene display:none.
      return Array.from(bar.children).filter((el) => el.getClientRects().length > 0).every((el) => {
        const r = el.getBoundingClientRect();
        return r.top < playback.bottom && playback.top < r.bottom;
      });
    }))) fail(`la barra superior ocupa más de una fila con relay (${width}px, ${theme})`);
    await capture(pg, `simulacion-${width}-${theme}`);
    const scenario = pg.getByLabel("Escenario", { exact: true });
    await scenario.selectOption("apagon-malaga");
    await pg.getByRole("button", { name: "Velocidad por 10" }).click();
    await pg.getByRole("button", { name: "Iniciar", exact: true }).click();
    await pg.waitForFunction(() => Number(document.querySelector('[data-kpi=calls]')?.getAttribute('data-value')) > 0);
    await pg.getByRole("button", { name: "Pausar", exact: true }).click();
    const simCalls = await kpi(pg, "calls");
    const simTime = await pg.locator(".clock").innerText();
    const simActions = () => pg.locator("#box-actions .act").evaluateAll((cards) => cards.map((card) => card.textContent));
    await pg.locator("#box-actions .act").first().waitFor();
    const simCards = await simActions();
    const simSent = await kpi(pg, "actions");
    if (await pg.locator(".inbox").isVisible()) fail("bandeja visible en Simulación");
    if (await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)) fail(`scroll horizontal en Simulación (${width}px, ${theme})`);
    const legacyCapture = captureTabs && theme === "dark" && width !== 1370;
    const suffix = width === 390 ? "-movil" : "";
    if (legacyCapture) await pg.screenshot({ path: `docs/capturas/pestanas-simulacion${suffix}.png` });

    await simTab(pg).focus();
    await pg.keyboard.press("ArrowRight");
    if ((await liveTab(pg).getAttribute("aria-selected")) !== "true") fail("no se puede abrir En directo con el teclado");
    await pg.locator(".inbox").getByRole("heading", { name: "Llamadas del público" }).waitFor();
    if (await pg.getByRole("img", { name: /Código QR que abre .*\/llamar/ }).count() ||
        await pg.getByText(/Escanea para llamar desde el móvil/).count()) fail("el QR o su dirección se muestran en la consola");
    const accept = pg.getByRole("button", { name: "Aceptar llamada P1" });
    await accept.waitFor();
    if (await scenario.count() || await pg.locator(".playback, .clock").count()) fail("controles de simulación visibles en En directo");
    if (await pg.locator("#box-waiting, #box-lost").count() || await pg.getByRole("button", { name: "Sonido de las llamadas" }).count()) fail("colas o audio del escenario visibles en En directo");
    const actions = pg.locator("#box-actions");
    await actions.getByText("Nada que confirmar ahora.", { exact: true }).waitFor();
    await pg.locator(".map-legend").getByText(/Por aprobar/).waitFor();
    if (await kpi(pg, "actions") !== 0) fail("acciones visibles antes de aceptar llamadas");
    if (await kpi(pg, "calls") || await kpi(pg, "incidents") || await pg.locator(".marker").count()) fail("llamadas sin aceptar en el mapa o en los contadores");
    await pg.getByRole("button", { name: "Descartar llamada P2" }).click();
    if (await kpi(pg, "calls") || await kpi(pg, "incidents")) fail("descartar modificó la cola o los incidentes");
    await simTab(pg).click();
    if (await scenario.inputValue() !== "apagon-malaga" || await kpi(pg, "calls") !== simCalls || await pg.locator(".clock").innerText() !== simTime) fail("no se conservó el estado de Simulación");
    await liveTab(pg).click();
    await accept.click();
    if (await kpi(pg, "calls") !== 1 || await kpi(pg, "incidents") !== 1 || await pg.locator(".marker").count() !== 1) fail("aceptar no creó la llamada y el incidente en En directo");
    if (await pg.getByRole("button", { name: "Descartar llamada P2" }).count()) fail("volvió la llamada descartada");
    const proposal = actions.locator('[data-tool="proponer_recursos"][data-status="propuesta"]').first();
    await proposal.waitFor();
    if (!(await pg.locator('[data-kpi=actions]').getAttribute("title")).includes("por aprobar")) fail("el resumen no indica las acciones pendientes");
    await pg.getByRole("button", { name: /^Aprobar \(\d+\)$/ }).click();
    if (await proposal.locator(".act-unit").count()) fail("la tarjeta de recursos muestra una unidad simulada en directo");
    await capture(pg, `directo-${width}-${theme}`);
    await proposal.getByRole("button", { name: /Aprobar y enviar:/ }).click();
    if (await kpi(pg, "actions") !== 1) fail("la aprobación en directo no incrementa el contador");
    await pg.locator(".agent-feed").getByText(/Enviado con tu aprobación \(simulación\)/).waitFor();
    await actions.getByRole("button", { name: /Enviadas/ }).click();
    await actions.locator('[data-tool="proponer_recursos"][data-status="enviada"]').getByText(/Aprobado y enviado · acuse/).waitFor();
    await simTab(pg).click();
    if (await kpi(pg, "calls") !== simCalls || await kpi(pg, "actions") !== simSent || JSON.stringify(await simActions()) !== JSON.stringify(simCards)) fail("una llamada o acción por QR contaminó Simulación");
    await liveTab(pg).click();
    if (await kpi(pg, "calls") !== 1 || await kpi(pg, "incidents") !== 1) fail("no se conservó el estado de En directo");
    if (await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth)) fail(`scroll horizontal en En directo (${width}px, ${theme})`);
    if (legacyCapture) await pg.screenshot({ path: `docs/capturas/pestanas-directo${suffix}.png` });
    await pg.reload();
    await liveTab(pg).waitFor();
    await pg.waitForFunction(() => document.querySelector('#tab-live[aria-selected="true"]') && document.querySelector('[data-kpi=actions][data-value="1"]'));
    await pg.close();
  }
  console.log("T8/S33 OK: SSE simulado, moderación, acciones aisladas y recarga en escritorio y móvil (claro y oscuro)");
}

await browser.close();
if (errors.length) fail("errores de consola: " + errors.join(" | "));
console.log("E2E OK: 27 llamadas (con la eCall EC1) → 7 incidentes, F1 y B2 preguntadas, eCall en A, árabe, acciones del agente, lote de duplicados, llamadas perdidas, unidades simuladas, peligros en la vía, agente de espera, falta saber, audio, Separar, sin errores de consola");
