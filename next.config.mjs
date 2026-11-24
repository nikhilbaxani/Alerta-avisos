// GITHUB_PAGES=1: exportación estática para GitHub Pages (sin rutas /api; la consola funciona en modo simulado
// en el navegador). PAGES_BASE_PATH es la subruta del sitio, p. ej. "/Alerta-avisos".
const pages = process.env.GITHUB_PAGES === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(pages && {
    output: "export",
    basePath: process.env.PAGES_BASE_PATH || "",
    images: { unoptimized: true },
    env: { NEXT_PUBLIC_STATIC_EXPORT: "1" },
  }),
};
export default nextConfig;
