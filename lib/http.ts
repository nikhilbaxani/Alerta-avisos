import { NextResponse } from "next/server";

/** Respuesta de error para la consola: siempre `{ error }` con un mensaje en castellano. */
export const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/** Error del modelo local o de la red, en castellano (fetch los da en inglés). */
export function upstreamError(e: unknown, fallback: string): string {
  if (!(e instanceof Error)) return fallback;
  if (e.name === "AbortError" || e.name === "TimeoutError") return "El modelo local tardó demasiado en responder";
  if (e.message === "fetch failed") return "No se pudo conectar con el modelo local";
  return e.message || fallback;
}

const fmtBytes =(n: number) => (n >= 1024 * 1024 ? `${Math.round(n / (1024 * 1024))} MB` : `${Math.round(n / 1024)} KB`);

/**
 * Lee el cuerpo sin pasar de `maxBytes`: corta en cuanto lo supera, aunque no venga `Content-Length`
 * (o mienta). Devuelve null si es demasiado grande.
 */
export async function readCapped(req: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export type BodyResult<T> = { ok: true; value: T } | { ok: false; res: NextResponse };

/** Lee y parsea un cuerpo JSON con tope de tamaño (413) y JSON válido (400). */
export async function readJson(req: Request, maxBytes: number): Promise<BodyResult<unknown>> {
  const bytes = await readCapped(req, maxBytes);
  if (!bytes) return { ok: false, res: fail(413, `La petición supera ${fmtBytes(maxBytes)}`) };
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, res: fail(400, "JSON no válido") };
  }
}

/** Lee un multipart/form-data con tope de tamaño (413) y formato válido (400). */
export async function readForm(req: Request, maxBytes: number): Promise<BodyResult<FormData>> {
  const bytes = await readCapped(req, maxBytes);
  if (!bytes) return { ok: false, res: fail(413, `La petición supera ${fmtBytes(maxBytes)}`) };
  try {
    const headers = { "content-type": req.headers.get("content-type") ?? "" };
    return { ok: true, value: await new Response(bytes, { headers }).formData() };
  } catch {
    return { ok: false, res: fail(400, "Formulario no válido: se esperaba un archivo de audio") };
  }
}
