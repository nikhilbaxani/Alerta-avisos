import { adviceFor } from "@/lib/advice";
import type { IncidentType, RiskTag } from "@/lib/types";

interface Props {
  type: IncidentType;
  risks: readonly RiskTag[];
  context?: string;
}

export default function AdviceList({ type, risks, context }: Props) {
  return (
    <section className="block caller-advice">
      <h3>Consejos para quien llama{context ? ` · ${context}` : ""}</h3>
      <p className="note">Solo para el operador: puedes leerlos durante la llamada. La consola no los envía.</p>
      <ul>
        {adviceFor({ type, risks }).map((line) => <li key={line}>{line}</li>)}
      </ul>
    </section>
  );
}
