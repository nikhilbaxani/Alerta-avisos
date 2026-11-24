"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** URL pública de /llamar respetando la subruta (GitHub Pages). */
export function callUrl(loc: Pick<Location, "origin" | "pathname">): string {
  return `${loc.origin}${loc.pathname.replace(/\/?$/, "/")}llamar`;
}

/** QR generado en local (SVG), sin red. */
export default function CallQRCode() {
  const [url, setUrl] = useState("");
  const [svg, setSvg] = useState("");

  useEffect(() => setUrl(callUrl(window.location)), []);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((out) => alive && setSvg(out))
      .catch(() => alive && setSvg(""));
    return () => {
      alive = false;
    };
  }, [url]);

  if (!url) return null;
  return (
    <div className="qr">
      {svg && <div className="qr-img" role="img" aria-label={`Código QR que abre ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />}
      <p className="note">Escanea para llamar desde el móvil:<br /><span className="qr-url">{url}</span></p>
    </div>
  );
}
