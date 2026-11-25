import Deck from "@/components/deck/Deck";
import "./deck.css";

export const metadata = {
  title: "Presentación · Agente 112",
  description: "Pitch de 3 minutos de Agente 112: el problema de las líneas del 112 en una catástrofe, la solución, la consola en directo y la hoja de ruta.",
};

export default function PresentationPage() {
  return <Deck />;
}
