import type { IncidentType, RiskTag } from "@/lib/types";

export const RISK_LABELS: Record<RiskTag, string> = {
  vida: "Riesgo vital",
  atrapados: "Personas atrapadas",
  menor: "Menor implicado",
  mayor: "Persona mayor",
  movilidad_reducida: "Movilidad reducida",
  agua_subiendo: "Agua subiendo",
  sin_respuesta: "No responde",
  inconsciente: "Inconsciente",
  herido: "Heridos",
  dolor_pecho: "Dolor torácico",
  sin_luz: "Sin suministro eléctrico",
  trafico: "Riesgo de tráfico",
  via_bloqueada: "Vía cortada",
  vehiculo_danado: "Vehículo dañado",
  cables_electricos: "Cables eléctricos en el suelo",
};

export const TYPE_LABELS: Record<IncidentType, string> = {
  inundacion_vehiculo: "Vehículo atrapado por agua",
  inundacion_vivienda: "Vivienda inundada",
  garaje_inundado: "Garaje inundado",
  arbol_caido: "Árbol caído",
  semaforos: "Semáforos apagados",
  medica: "Emergencia médica",
  incendio: "Incendio",
  accidente: "Accidente de tráfico",
  otro: "Otro",
};

export const LANG_NAMES: Record<string, string> = {
  es: "Castellano",
  en: "Inglés",
  de: "Alemán",
  fr: "Francés",
  ar: "Árabe",
  it: "Italiano",
};

export const SEVERITY_LABELS: Record<number, string> = {
  1: "Leve",
  2: "Baja",
  3: "Media",
  4: "Alta",
  5: "Crítica",
};
