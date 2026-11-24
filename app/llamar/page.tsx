import CallRecorder from "./CallRecorder";

export const metadata = {
  title: "Llamar · Agente 112 (demo)",
  description: "Demo de hackathon: graba una llamada de prueba. No es un servicio de emergencias.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#171513" },
    { media: "(prefers-color-scheme: light)", color: "#f3f0ea" },
  ],
};

export default function Page() {
  return <CallRecorder />;
}
