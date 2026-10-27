import type { Aml, Extraction, Scenario, ScenarioCall } from "@/lib/types";

/**
 * Escenario 2 (X01): apagón sobre Málaga, ~3,5 minutos de llamadas.
 * 16 llamadas, 4 idiomas, 6 incidentes reales. Todos los datos son ficticios.
 * Sirve para enseñar que el sistema generaliza: ascensores, semáforos, oxígeno domiciliario y residencias.
 *
 *  H  Ascensor con cuatro personas atrapadas, calle Larios
 *  I  Semáforos apagados, Alameda Principal
 *  J  Mujer de 82 años con concentrador de oxígeno sin luz, calle Victoria 12
 *  L  Incendio en una vivienda por velas, calle Cruz de Humilladero
 *  M  Segundo ascensor atascado a ~560 m de H (zona gris: decide el operador)
 *  K  Residencia de mayores sin luz ni generador, Teatinos
 */

const BASE: Record<string, { lat: number; lng: number }> = {
  H: { lat: 36.7197, lng: -4.4215 },
  I: { lat: 36.7166, lng: -4.4235 },
  J: { lat: 36.7235, lng: -4.415 },
  L: { lat: 36.7143, lng: -4.44 },
  M: { lat: 36.7222, lng: -4.416 },
  K: { lat: 36.7165, lng: -4.4745 },
};

function at(inc: string, dx: number, dy: number, acc: number): Aml {
  const b = BASE[inc];
  const lat = b.lat + dy / 111_320;
  const lng = b.lng + dx / (111_320 * Math.cos((b.lat * Math.PI) / 180));
  return { lat: +lat.toFixed(6), lng: +lng.toFixed(6), acc };
}

type Row = Omit<ScenarioCall, "mock"> & { mock: Omit<Extraction, "language"> };

const rows: Row[] = [
  {
    id: "H1", t: 10, lang: "es", phone: "+34 6•• ••• 118", gold: "H", aml: at("H", 10, 5, 20),
    transcript: "Estamos atrapados en el ascensor de un edificio de la calle Larios, somos cuatro personas. Se ha ido la luz y no se abre. Hay una mujer embarazada y empieza a hacer calor.",
    mock: {
      translation_es: null,
      summary_es: "Cuatro personas atrapadas en un ascensor de la calle Larios por el apagón; una mujer embarazada.",
      incident_type: "ascensor", location_text: "Edificio en calle Larios",
      keywords: ["ascensor", "calle Larios", "edificio", "atrapados", "sin luz"],
      risks: ["atrapados", "sin_luz"], people_at_risk: 4, severity: 3,
    },
  },
  {
    id: "I1", t: 18, lang: "es", phone: "+34 6•• ••• 640", gold: "I", aml: at("I", 0, 0, 25),
    transcript: "En la Alameda Principal no funcionan los semáforos desde que se fue la luz. Los coches se cruzan sin mirar y hay un atasco enorme.",
    mock: {
      translation_es: null,
      summary_es: "Semáforos apagados en la Alameda Principal; atasco y cruces peligrosos.",
      incident_type: "semaforos", location_text: "Alameda Principal",
      keywords: ["semáforos", "Alameda Principal", "atasco", "cruce"],
      risks: ["trafico", "sin_luz"], people_at_risk: 0, severity: 2,
    },
  },
  {
    id: "J1", t: 30, lang: "es", phone: "+34 6•• ••• 275", gold: "J", aml: at("J", 5, -5, 20),
    transcript: "Mi madre tiene 82 años y respira con un concentrador de oxígeno en casa, en la calle Victoria 12. Con el apagón se ha parado la máquina y se está poniendo azul. Por favor, rápido.",
    mock: {
      translation_es: null,
      summary_es: "Mujer de 82 años dependiente de oxígeno domiciliario sin luz en c/ Victoria 12; se pone azul.",
      incident_type: "medica", location_text: "Calle Victoria 12",
      keywords: ["oxígeno", "concentrador", "calle Victoria", "madre", "sin luz"],
      risks: ["vida", "mayor", "sin_luz"], people_at_risk: 1, severity: 5,
    },
  },
  {
    id: "L1", t: 42, lang: "en", phone: "+44 7••• ••• 902", gold: "L", aml: at("L", -10, 8, 40),
    transcript: "There is smoke coming out of an apartment on Cruz de Humilladero street. Someone must have left candles burning because of the blackout. I can see flames in the window.",
    mock: {
      translation_es: "Sale humo de un apartamento de la calle Cruz de Humilladero. Alguien debe de haber dejado velas encendidas por el apagón. Veo llamas en la ventana.",
      summary_es: "Incendio en una vivienda de c/ Cruz de Humilladero, probablemente por velas; se ven llamas.",
      incident_type: "incendio", location_text: "Calle Cruz de Humilladero",
      keywords: ["humo", "llamas", "apartamento", "Cruz de Humilladero", "velas"],
      risks: ["vida"], people_at_risk: 2, severity: 4,
    },
  },
  {
    id: "H2", t: 55, lang: "en", phone: "+44 7••• ••• 331", gold: "H", aml: at("H", -30, 15, 120),
    transcript: "Hi, I'm stuck in a lift in a building on Larios street with three other people. There's no light and it's getting very hot. Please send someone.",
    mock: {
      translation_es: "Hola, estoy atrapado en un ascensor de un edificio de la calle Larios con otras tres personas. No hay luz y hace mucho calor. Por favor, envíen a alguien.",
      summary_es: "Cuatro personas atrapadas en un ascensor de la calle Larios; sin luz y con calor.",
      incident_type: "ascensor", location_text: "Edificio en calle Larios",
      keywords: ["ascensor", "calle Larios", "edificio", "atrapados", "sin luz"],
      risks: ["atrapados", "sin_luz"], people_at_risk: 4, severity: 3,
    },
  },
  {
    id: "I2", t: 66, lang: "de", phone: "+49 15• ••• 8841", gold: "I", aml: at("I", 25, -15, 60),
    transcript: "Hallo, an der Alameda Principal sind alle Ampeln aus. Die Autos fahren durcheinander, fast ein Unfall. Bitte schicken Sie die Polizei.",
    mock: {
      translation_es: "Hola, en la Alameda Principal están todos los semáforos apagados. Los coches van desordenados, casi un accidente. Por favor, envíen a la policía.",
      summary_es: "Semáforos apagados en la Alameda Principal; casi un accidente.",
      incident_type: "semaforos", location_text: "Alameda Principal",
      keywords: ["semáforos", "Alameda Principal", "tráfico", "accidente"],
      risks: ["trafico", "sin_luz"], people_at_risk: 0, severity: 2,
    },
  },
  {
    id: "J2", t: 80, lang: "en", phone: "+44 7••• ••• 515", gold: "J", aml: at("J", 40, 30, 150),
    transcript: "I'm calling for my neighbour, an old lady on calle Victoria, number 12. Her oxygen machine stopped with the blackout and she is struggling to breathe.",
    mock: {
      translation_es: "Llamo por mi vecina, una señora mayor de la calle Victoria, número 12. Su máquina de oxígeno se paró con el apagón y le cuesta respirar.",
      summary_es: "Vecina mayor en c/ Victoria 12 con el concentrador de oxígeno parado; le cuesta respirar.",
      incident_type: "medica", location_text: "Calle Victoria 12",
      keywords: ["oxígeno", "calle Victoria", "señora mayor", "sin luz", "respirar"],
      risks: ["vida", "mayor", "sin_luz"], people_at_risk: 1, severity: 5,
    },
  },
  {
    id: "M1", t: 95, lang: "es", phone: "+34 6•• ••• 764", gold: "M", aml: at("M", 0, 0, 25),
    transcript: "Hay otro ascensor parado, en un edificio de la Plaza de la Merced. Hay dos personas dentro, un señor con un bastón. No es el de Larios, este es otro.",
    mock: {
      translation_es: null,
      summary_es: "Dos personas atrapadas en otro ascensor, en un edificio de la Plaza de la Merced.",
      incident_type: "ascensor", location_text: "Plaza de la Merced",
      keywords: ["ascensor", "Plaza de la Merced", "señor mayor", "bastón"],
      risks: ["atrapados", "sin_luz", "mayor"], people_at_risk: 2, severity: 3,
    },
  },
  {
    id: "K1", t: 110, lang: "es", phone: "+34 6•• ••• 099", gold: "K", aml: at("K", 0, 0, 30),
    transcript: "Soy trabajadora de la residencia de mayores de Teatinos. Estamos sin luz y el generador no arranca. Tenemos sesenta residentes y varios con oxígeno y camas eléctricas.",
    mock: {
      translation_es: null,
      summary_es: "Residencia de mayores de Teatinos sin luz ni generador; 60 residentes, varios con oxígeno.",
      incident_type: "otro", location_text: "Residencia de mayores, Teatinos",
      keywords: ["residencia", "mayores", "Teatinos", "generador", "oxígeno", "sin luz"],
      risks: ["vida", "mayor", "sin_luz", "movilidad_reducida"], people_at_risk: 5, severity: 4,
    },
  },
  {
    id: "I3", t: 125, lang: "es", phone: "+34 6•• ••• 380", gold: "I", aml: at("I", -30, 10, 30),
    transcript: "Los semáforos de la Alameda Principal siguen apagados, junto a la Plaza de la Marina. Un peatón casi acaba atropellado.",
    mock: {
      translation_es: null,
      summary_es: "Semáforos apagados en la Alameda Principal (Plaza de la Marina); peatón casi atropellado.",
      incident_type: "semaforos", location_text: "Alameda Principal, Plaza de la Marina",
      keywords: ["semáforos", "Alameda Principal", "peatón", "tráfico"],
      risks: ["trafico", "sin_luz"], people_at_risk: 0, severity: 2,
    },
  },
  {
    id: "H3", t: 140, lang: "es", phone: "+34 6•• ••• 118", gold: "H", aml: at("H", 15, 0, 20),
    transcript: "Soy la del ascensor de la calle Larios otra vez. La mujer embarazada se ha desmayado y no responde. Por favor, vengan ya.",
    mock: {
      translation_es: null,
      summary_es: "En el ascensor de la calle Larios la mujer embarazada se ha desmayado y no responde.",
      incident_type: "ascensor", location_text: "Edificio en calle Larios",
      keywords: ["ascensor", "calle Larios", "embarazada", "desmayada", "atrapados"],
      risks: ["atrapados", "sin_luz", "inconsciente", "sin_respuesta"], people_at_risk: 4, severity: 4,
    },
  },
  {
    id: "K2", t: 160, lang: "ar", phone: "+34 6•• ••• 442", gold: "K", aml: at("K", 600, 450, 25),
    transcript: "مرحبا، أتصل بخصوص دار المسنين في تياتينوس. لا توجد كهرباء ولا يعمل المولد، والمسنون يحتاجون إلى الأكسجين. جدتي هناك.",
    mock: {
      translation_es: "Hola, llamo por la residencia de mayores de Teatinos. No hay electricidad y el generador no funciona; los mayores necesitan oxígeno. Mi abuela está allí.",
      summary_es: "Residencia de mayores de Teatinos sin electricidad ni generador; residentes con oxígeno.",
      incident_type: "otro", location_text: "Residencia de mayores, Teatinos",
      keywords: ["residencia", "mayores", "Teatinos", "generador", "oxígeno"],
      risks: ["vida", "mayor", "sin_luz"], people_at_risk: 5, severity: 4,
    },
  },
  {
    id: "L2", t: 170, lang: "es", phone: "+34 6•• ••• 826", gold: "L", aml: at("L", 20, -10, 35),
    transcript: "Se está quemando un piso en la calle Cruz de Humilladero, hay mucho humo y creo que dentro hay un niño pequeño. Los vecinos gritan desde el portal.",
    mock: {
      translation_es: null,
      summary_es: "Piso en llamas en c/ Cruz de Humilladero con mucho humo; posible niño dentro.",
      incident_type: "incendio", location_text: "Calle Cruz de Humilladero",
      keywords: ["piso", "humo", "llamas", "Cruz de Humilladero", "niño"],
      risks: ["vida", "menor", "atrapados"], people_at_risk: 2, severity: 5,
    },
  },
  {
    id: "J3", t: 185, lang: "es", phone: "+34 6•• ••• 275", gold: "J", aml: at("J", 0, 0, 20),
    transcript: "Vuelvo a llamar por mi madre, la del oxígeno de la calle Victoria. Ya no me contesta y no la oigo respirar.",
    mock: {
      translation_es: null,
      summary_es: "La mujer dependiente de oxígeno de c/ Victoria 12 ya no responde.",
      incident_type: "medica", location_text: "Calle Victoria 12",
      keywords: ["oxígeno", "calle Victoria", "madre", "no responde"],
      risks: ["vida", "mayor", "sin_respuesta", "inconsciente"], people_at_risk: 1, severity: 5,
    },
  },
  {
    id: "M2", t: 200, lang: "es", phone: "+34 6•• ••• 764", gold: "M", aml: at("M", 10, 5, 25),
    transcript: "Sigo en el ascensor de la Plaza de la Merced con el señor del bastón. Se está agobiando, le falta el aire.",
    mock: {
      translation_es: null,
      summary_es: "En el ascensor de la Plaza de la Merced el señor mayor se agobia y le falta el aire.",
      incident_type: "ascensor", location_text: "Plaza de la Merced",
      keywords: ["ascensor", "Plaza de la Merced", "señor mayor", "bastón", "agobia"],
      risks: ["atrapados", "sin_luz", "mayor"], people_at_risk: 2, severity: 3,
    },
  },
  {
    id: "I4", t: 215, lang: "en", phone: "+44 7••• ••• 207", gold: "I", aml: at("I", 10, -20, 50),
    transcript: "The traffic lights are still out on the Alameda Principal avenue, near the port. Cars keep blocking the crossing.",
    mock: {
      translation_es: "Los semáforos siguen apagados en la avenida Alameda Principal, cerca del puerto. Los coches siguen bloqueando el cruce.",
      summary_es: "Semáforos apagados en la Alameda Principal; cruce bloqueado.",
      incident_type: "semaforos", location_text: "Alameda Principal, puerto",
      keywords: ["semáforos", "Alameda Principal", "cruce", "tráfico"],
      risks: ["trafico", "sin_luz"], people_at_risk: 0, severity: 2,
    },
  },
];

export const scenarioApagon: Scenario = {
  id: "apagon-malaga",
  name: "Apagón en Málaga",
  place: "Málaga",
  calls: rows.map((r) => ({ ...r, mock: { ...r.mock, language: r.lang } })),
};
