import "./globals.css";

export const metadata = {
  title: "Copiloto 112",
  description: "Copiloto de IA para salas del 112: agrupa llamadas duplicadas, prioriza y traduce. El operador decide.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
