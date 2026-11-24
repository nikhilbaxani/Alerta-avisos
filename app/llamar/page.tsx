import CallRecorder from "./CallRecorder";

export const metadata = {
  title: "Llamar · Copiloto 112 (demo)",
  description: "Demo de hackathon: graba una llamada de prueba. No es un servicio de emergencias.",
};

export default function Page() {
  return <CallRecorder />;
}
