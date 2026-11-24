import "./globals.css";

export const metadata = {
  title: "Copiloto 112",
  description: "Copiloto de IA para salas del 112: agrupa llamadas duplicadas, prioriza y traduce. El operador decide.",
};

/** Aplica el tema guardado (oscuro por defecto) antes de pintar, para que no parpadee. */
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
