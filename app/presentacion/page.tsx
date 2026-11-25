import Deck from "@/components/deck/Deck";
import "./deck.css";

export const metadata = {
  title: "Presentación · Agente 112",
  description: "Presentación interactiva del Agente 112: el problema de las líneas del 112 en una catástrofe y la consola en directo.",
};

export default function PresentationPage() {
  return <Deck />;
}
