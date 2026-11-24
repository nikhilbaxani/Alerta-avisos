"use client";

import { useMemo } from "react";
import { encodeQr, qrPath } from "@/lib/qr";

/** QR en SVG generado en el navegador (lib/qr.ts): sin servicios externos. */
export default function QrCode({ text, label }: { text: string; label: string }) {
  const { d, size } = useMemo(() => qrPath(encodeQr(text, "M")), [text]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#15222e" />
    </svg>
  );
}
