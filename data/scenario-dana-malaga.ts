import type { Aml, Extraction, Scenario, ScenarioCall } from "@/lib/types";

/**
 * Escenario simulado: DANA sobre Málaga, ~5,5 minutos de llamadas.
 * 26 llamadas, 6 idiomas, 7 incidentes reales. Todos los datos son ficticios.
 *
 * Incidentes reales (campo `gold`, el sistema no lo ve):
 *  A  Coche con una familia atrapado en el paso inferior de la A-357, Campanillas
 *  B  Planta baja inundada con una mujer mayor dentro, calle Cuarteles (El Perchel)
 *  C  Árbol caído sobre un coche, Paseo Marítimo Pablo Ruiz Picasso
 *  D  Semáforos apagados, Avenida de Andalucía (mucho volumen, poca gravedad)
 *  E  Hombre de 70 años con dolor torácico, sexto piso sin ascensor, Torremolinos (árabe)
 *  F  Segundo coche atrapado a ~460 m de A: no debe fusionarse sin que decida el operador
 *  G  Garaje inundándose con un vecino dentro, Rincón de la Victoria
 */

const BASE: Record<string, { lat: number; lng: number }> = {
  A: { lat: 36.716, lng: -4.548 },
  B: { lat: 36.7155, lng: -4.429 },
  C: { lat: 36.7195, lng: -4.4 },
  D: { lat: 36.718, lng: -4.435 },
  E: { lat: 36.623, lng: -4.499 },
  F: { lat: 36.718, lng: -4.5435 },
  G: { lat: 36.716, lng: -4.278 },
};

/** Desplaza un punto `dx` metros al este y `dy` al norte. */
function at(inc: string, dx: number, dy: number, acc: number): Aml {
  const b = BASE[inc];
  const lat = b.lat + dy / 111_320;
  const lng = b.lng + dx / (111_320 * Math.cos((b.lat * Math.PI) / 180));
  return { lat: +lat.toFixed(6), lng: +lng.toFixed(6), acc };
}

type Row = Omit<ScenarioCall, "mock"> & { mock: Omit<Extraction, "language"> };

const rows: Row[] = [
  {
    id: "A1", t: 8, lang: "es", phone: "+34 6•• ••• 412", gold: "A", aml: at("A", -40, 25, 18),
    transcript:
      "¡Por favor! Hay un coche atrapado en el paso inferior de la A-357, en Campanillas, junto al río. El agua le llega casi a las puertas y dentro hay una familia, creo que tres personas. No pueden abrir.",
    mock: {
      translation_es: null,
      summary_es: "Coche con una familia (3) atrapado en el paso inferior de la A-357; el agua llega a las puertas.",
      incident_type: "inundacion_vehiculo", location_text: "Paso inferior A-357, Campanillas",
      keywords: ["coche", "paso inferior", "A-357", "familia", "río", "Campanillas"],
      risks: ["vida", "atrapados", "agua_subiendo"], people_at_risk: 3, severity: 5,
    },
  },
  {
    id: "D1", t: 20, lang: "es", phone: "+34 6•• ••• 090", gold: "D", aml: at("D", 30, -10, 25),
    transcript:
      "Llamo porque en la Avenida de Andalucía, a la altura de El Corte Inglés, los semáforos están apagados y hay un caos de tráfico. Casi chocan dos coches.",
    mock: {
      translation_es: null,
      summary_es: "Semáforos apagados en la Avenida de Andalucía (El Corte Inglés); casi colisión.",
      incident_type: "semaforos", location_text: "Avenida de Andalucía, El Corte Inglés",
      keywords: ["semáforos", "Avenida de Andalucía", "tráfico", "cruce", "Corte Inglés"],
      risks: ["trafico", "sin_luz"], people_at_risk: 0, severity: 2,
    },
  },
  {
    id: "A2", t: 34, lang: "en", phone: "+44 7••• ••• 318", gold: "A", aml: at("A", 90, 70, 150),
    transcript:
      "Hello, I'm on the bridge near Campanillas, there's a car stuck under the road in the water, in the underpass. People inside are waving, the water is rising fast. Please hurry.",
    mock: {
      translation_es:
        "Hola, estoy en el puente cerca de Campanillas, hay un coche atrapado bajo la carretera, en el agua, en el paso inferior. La gente de dentro hace señas, el agua sube rápido. Por favor, dense prisa.",
      summary_es: "Testigo desde el puente: coche con ocupantes en el paso inferior, el agua sube rápido.",
      incident_type: "inundacion_vehiculo", location_text: "Paso inferior cerca de Campanillas",
      keywords: ["coche", "paso inferior", "agua", "Campanillas", "personas dentro"],
      risks: ["vida", "atrapados", "agua_subiendo"], people_at_risk: 2, severity: 5,
    },
  },
  {
    id: "B1", t: 47, lang: "es", phone: "+34 6•• ••• 735", gold: "B", aml: at("B", 15, 10, 20),
    transcript:
      "Soy vecino de la calle Cuarteles, en El Perchel. Se ha inundado la planta baja del número 14 y ahí vive una señora mayor sola, Carmen, que va en silla de ruedas. El agua ya entra en las casas.",
    mock: {
      translation_es: null,
      summary_es: "Planta baja inundada en c/ Cuarteles 14; mujer mayor sola en silla de ruedas dentro.",
      incident_type: "inundacion_vivienda", location_text: "Calle Cuarteles 14, El Perchel",
      keywords: ["planta baja", "calle Cuarteles", "señora mayor", "silla de ruedas", "Perchel"],
      risks: ["vida", "mayor", "movilidad_reducida", "agua_subiendo"], people_at_risk: 1, severity: 4,
    },
  },
  {
    id: "C1", t: 61, lang: "es", phone: "+34 6•• ••• 561", gold: "C", aml: at("C", 0, 0, 30),
    transcript:
      "Se ha caído un árbol enorme en el Paseo Marítimo Pablo Ruiz Picasso, encima de un coche aparcado. No sé si hay alguien dentro. Corta la carretera entera.",
    mock: {
      translation_es: null,
      summary_es: "Árbol caído sobre un coche aparcado en el Paseo Marítimo; corta la vía. Ocupantes desconocidos.",
      incident_type: "arbol_caido", location_text: "Paseo Marítimo Pablo Ruiz Picasso",
      keywords: ["árbol", "coche", "Paseo Marítimo", "Pablo Ruiz Picasso", "carretera cortada"],
      risks: ["via_bloqueada", "vehiculo_danado"], people_at_risk: 0, severity: 3,
    },
  },
  {
    id: "A3", t: 75, lang: "de", phone: "+49 15• ••• 2207", gold: "A", aml: at("A", -120, -60, 80),
    transcript:
      "Hallo, ich spreche kein Spanisch. Hier steckt ein Auto in der Unterführung fest, bei Campanillas. Das Wasser steigt, da sind Leute drin. Bitte schicken Sie Hilfe!",
    mock: {
      translation_es:
        "Hola, no hablo español. Aquí hay un coche atascado en el paso inferior, cerca de Campanillas. El agua sube, hay gente dentro. ¡Por favor, envíen ayuda!",
      summary_es: "Coche atascado en el paso inferior de Campanillas con gente dentro; el agua sube.",
      incident_type: "inundacion_vehiculo", location_text: "Paso inferior, Campanillas",
      keywords: ["coche", "paso inferior", "Campanillas", "gente dentro", "agua"],
      risks: ["vida", "atrapados", "agua_subiendo"], people_at_risk: 2, severity: 5,
    },
  },
  {
    id: "D2", t: 88, lang: "es", phone: "+34 6•• ••• 873", gold: "D", aml: at("D", -60, 40, 35),
    transcript:
      "Los semáforos de la Avenida de Andalucía no funcionan, en el cruce con la calle Hilera. Está todo atascado.",
    mock: {
      translation_es: null,
      summary_es: "Semáforos sin funcionar en Av. de Andalucía con c/ Hilera; atasco.",
      incident_type: "semaforos", location_text: "Avenida de Andalucía con calle Hilera",
      keywords: ["semáforos", "Avenida de Andalucía", "Hilera", "atasco", "cruce"],
      risks: ["trafico", "sin_luz"], people_at_risk: 0, severity: 2,
    },
  },
  {
    id: "E1", t: 102, lang: "ar", phone: "+34 6•• ••• 158", gold: "E", aml: at("E", 0, 0, 40),
    transcript:
      "مرحبا، أنا في توريمولينوس، في عمارة قرب محطة القطار. أبي عمره سبعون سنة، عنده ألم قوي في صدره ولا يستطيع أن يتنفس جيداً. الكهرباء مقطوعة والمصعد لا يعمل، ونحن في الطابق السادس.",
    mock: {
      translation_es:
        "Hola, estoy en Torremolinos, en un edificio cerca de la estación de tren. Mi padre tiene setenta años, tiene un dolor fuerte en el pecho y no puede respirar bien. No hay luz y el ascensor no funciona, estamos en la sexta planta.",
      summary_es: "Hombre de 70 años con dolor torácico y dificultad respiratoria; 6.ª planta, sin luz ni ascensor.",
      incident_type: "medica", location_text: "Edificio junto a la estación, Torremolinos",
      keywords: ["dolor de pecho", "padre", "Torremolinos", "sexta planta", "ascensor", "sin luz"],
      risks: ["vida", "dolor_pecho", "mayor", "sin_luz"], people_at_risk: 1, severity: 5,
    },
  },
  {
    id: "C2", t: 115, lang: "en", phone: "+44 7••• ••• 664", gold: "C", aml: at("C", -140, -20, 60),
    transcript:
      "There's a big tree that just fell on a car on the seafront promenade, near the beach bars at La Malagueta. The road is blocked. I don't think anyone was inside, but I'm not sure.",
    mock: {
      translation_es:
        "Un árbol grande acaba de caer sobre un coche en el paseo marítimo, cerca de los chiringuitos de La Malagueta. La carretera está cortada. No creo que hubiera nadie dentro, pero no estoy seguro.",
      summary_es: "Árbol caído sobre un coche en el paseo marítimo (La Malagueta); vía cortada.",
      incident_type: "arbol_caido", location_text: "Paseo marítimo, La Malagueta",
      keywords: ["árbol", "coche", "paseo marítimo", "carretera cortada", "Malagueta"],
      risks: ["via_bloqueada", "vehiculo_danado"], people_at_risk: 0, severity: 3,
    },
  },
  {
    id: "F1", t: 128, lang: "es", phone: "+34 6•• ••• 947", gold: "F", aml: at("F", 0, 0, 30),
    transcript:
      "Mi coche se ha quedado parado en el Camino del Prado, en Campanillas, y el agua me llega a las rodillas dentro del coche. Estoy sola. Tengo miedo de salir.",
    mock: {
      translation_es: null,
      summary_es: "Mujer sola atrapada en su coche en el Camino del Prado; agua a las rodillas dentro.",
      incident_type: "inundacion_vehiculo", location_text: "Camino del Prado, Campanillas",
      keywords: ["coche", "Camino del Prado", "Campanillas", "agua", "sola"],
      risks: ["vida", "atrapados", "agua_subiendo"], people_at_risk: 1, severity: 5,
    },
  },
  {
    id: "D3", t: 139, lang: "es", phone: "+34 6•• ••• 302", gold: "D", aml: at("D", 20, 15, 30),
    transcript:
      "Oiga, en la Avenida de Andalucía no hay semáforos, hay gente cruzando entre los coches. Alguien va a acabar atropellado.",
    mock: {
      translation_es: null,
      summary_es: "Peatones cruzando entre coches en la Av. de Andalucía sin semáforos.",
      incident_type: "semaforos", location_text: "Avenida de Andalucía",
      keywords: ["semáforos", "Avenida de Andalucía", "peatones", "tráfico"],
      risks: ["trafico", "sin_luz"], people_at_risk: 0, severity: 2,
    },
  },
  {
    id: "B2", t: 151, lang: "es", phone: "+34 6•• ••• 228", gold: "B", aml: at("B", 1400, 900, 25),
    transcript:
      "Llamo por mi madre, Carmen. Vive sola en la calle Cuarteles 14, en el bajo. No me coge el teléfono y los vecinos dicen que el agua está entrando. Ella no puede andar.",
    mock: {
      translation_es: null,
      summary_es: "Hija de la vecina de c/ Cuarteles 14: su madre no contesta al teléfono y no puede andar.",
      incident_type: "inundacion_vivienda", location_text: "Calle Cuarteles 14, bajo",
      keywords: ["madre", "calle Cuarteles", "bajo", "señora mayor", "no puede andar"],
      risks: ["vida", "mayor", "movilidad_reducida", "agua_subiendo"], people_at_risk: 1, severity: 4,
    },
  },
  {
    id: "A4", t: 163, lang: "es", phone: "+34 6•• ••• 519", gold: "A", aml: at("A", 60, -90, 20),
    transcript:
      "Estoy viendo desde mi terraza el coche del paso inferior de Campanillas. El agua ya llega a las ventanillas y he visto que hay un bebé dentro. ¡Rápido!",
    mock: {
      translation_es: null,
      summary_es: "El agua llega a las ventanillas del coche del paso inferior; hay un bebé dentro.",
      incident_type: "inundacion_vehiculo", location_text: "Paso inferior, Campanillas",
      keywords: ["coche", "paso inferior", "Campanillas", "bebé", "ventanillas"],
      risks: ["vida", "atrapados", "agua_subiendo", "menor"], people_at_risk: 3, severity: 5,
    },
  },
  {
    id: "C3", t: 176, lang: "fr", phone: "+33 6 •• •• •• 41", gold: "C", aml: at("C", -60, 30, 45),
    transcript:
      "Bonjour, un arbre est tombé sur une voiture sur la promenade, près de la plage de la Malagueta. Il y a aussi des câbles électriques par terre. Faites attention.",
    mock: {
      translation_es:
        "Buenos días, ha caído un árbol sobre un coche en el paseo, cerca de la playa de la Malagueta. También hay cables eléctricos en el suelo. Tengan cuidado.",
      summary_es: "Árbol sobre un coche en el paseo de la Malagueta; cables eléctricos en el suelo.",
      incident_type: "arbol_caido", location_text: "Paseo, playa de la Malagueta",
      keywords: ["árbol", "coche", "paseo", "Malagueta", "cables"],
      risks: ["via_bloqueada", "vehiculo_danado", "cables_electricos"], people_at_risk: 0, severity: 4,
    },
  },
  {
    id: "G1", t: 189, lang: "es", phone: "+34 6•• ••• 680", gold: "G", aml: at("G", 0, 0, 25),
    transcript:
      "En Rincón de la Victoria, en la urbanización junto a la avenida del Mediterráneo, se está inundando el garaje y hay gente bajando a sacar los coches. Hay como medio metro de agua.",
    mock: {
      translation_es: null,
      summary_es: "Garaje inundándose (≈50 cm) en Rincón de la Victoria; vecinos bajando a por los coches.",
      incident_type: "garaje_inundado", location_text: "Avenida del Mediterráneo, Rincón de la Victoria",
      keywords: ["garaje", "Rincón de la Victoria", "avenida del Mediterráneo", "coches", "agua"],
      risks: ["agua_subiendo"], people_at_risk: 3, severity: 3,
    },
  },
  {
    id: "D4", t: 201, lang: "es", phone: "+34 6•• ••• 117", gold: "D", aml: at("D", 35, -20, 40),
    transcript: "Semáforos apagados en la Avenida de Andalucía, delante del Corte Inglés.",
    mock: {
      translation_es: null,
      summary_es: "Semáforos apagados frente a El Corte Inglés, Av. de Andalucía.",
      incident_type: "semaforos", location_text: "Avenida de Andalucía, El Corte Inglés",
      keywords: ["semáforos", "Avenida de Andalucía", "Corte Inglés"],
      risks: ["trafico", "sin_luz"], people_at_risk: 0, severity: 2,
    },
  },
  {
    id: "A5", t: 214, lang: "es", phone: "+34 6•• ••• 883", gold: "A", aml: at("A", 150, 120, 300),
    transcript: "¡El coche del túnel de Campanillas! Ya casi no se ve. ¿Viene alguien?",
    mock: {
      translation_es: null,
      summary_es: "El coche del túnel de Campanillas casi sumergido; preguntan si llega ayuda.",
      incident_type: "inundacion_vehiculo", location_text: "Túnel de Campanillas",
      keywords: ["coche", "túnel", "Campanillas"],
      risks: ["vida", "atrapados", "agua_subiendo"], people_at_risk: 3, severity: 5,
    },
  },
  {
    id: "G2", t: 228, lang: "en", phone: "+44 7••• ••• 905", gold: "G", aml: at("G", 70, 40, 50),
    transcript:
      "Hi, I'm staying in an apartment in Rincón de la Victoria. The underground car park is flooding, my neighbours went down to get their cars and the water keeps rising. Should we go down?",
    mock: {
      translation_es:
        "Hola, estoy en un apartamento en Rincón de la Victoria. El aparcamiento subterráneo se está inundando, mis vecinos bajaron a por sus coches y el agua sigue subiendo. ¿Deberíamos bajar?",
      summary_es: "Aparcamiento subterráneo inundándose en Rincón; vecinos abajo y el agua sigue subiendo.",
      incident_type: "garaje_inundado", location_text: "Apartamentos, Rincón de la Victoria",
      keywords: ["garaje", "aparcamiento", "Rincón de la Victoria", "vecinos", "agua"],
      risks: ["agua_subiendo", "vida"], people_at_risk: 3, severity: 4,
    },
  },
  {
    id: "B3", t: 241, lang: "es", phone: "+34 6•• ••• 446", gold: "B", aml: at("B", -10, 20, 15),
    transcript:
      "Soy otra vecina de la calle Cuarteles. El agua ya llega por la cintura en la planta baja y la señora Carmen no contesta cuando la llamamos por la ventana.",
    mock: {
      translation_es: null,
      summary_es: "Agua a la cintura en la planta baja de c/ Cuarteles; la vecina mayor no responde por la ventana.",
      incident_type: "inundacion_vivienda", location_text: "Calle Cuarteles, planta baja",
      keywords: ["calle Cuarteles", "planta baja", "señora mayor", "no contesta", "cintura"],
      risks: ["vida", "mayor", "movilidad_reducida", "agua_subiendo", "sin_respuesta"], people_at_risk: 1, severity: 5,
    },
  },
  {
    id: "D5", t: 253, lang: "en", phone: "+353 8• ••• 7731", gold: "D", aml: at("D", -30, -40, 60),
    transcript: "Hi, the traffic lights are out on Avenida de Andalucía. It's chaos, someone should direct the traffic.",
    mock: {
      translation_es:
        "Hola, los semáforos están apagados en la Avenida de Andalucía. Es un caos, alguien debería dirigir el tráfico.",
      summary_es: "Semáforos apagados en la Av. de Andalucía; piden que alguien dirija el tráfico.",
      incident_type: "semaforos", location_text: "Avenida de Andalucía",
      keywords: ["semáforos", "Avenida de Andalucía", "tráfico"],
      risks: ["trafico", "sin_luz"], people_at_risk: 0, severity: 2,
    },
  },
  {
    id: "F2", t: 266, lang: "es", phone: "+34 6•• ••• 372", gold: "F", aml: at("F", 25, 20, 25),
    transcript:
      "Hay una mujer dentro de un coche en el Camino del Prado, en Campanillas. El agua sube mucho. No es el del túnel, es otro coche, en la calle de arriba.",
    mock: {
      translation_es: null,
      summary_es: "Otro coche, distinto al del túnel: mujer atrapada en el Camino del Prado; el agua sube.",
      incident_type: "inundacion_vehiculo", location_text: "Camino del Prado, Campanillas",
      keywords: ["mujer", "coche", "Camino del Prado", "Campanillas", "agua", "otro coche"],
      risks: ["vida", "atrapados", "agua_subiendo"], people_at_risk: 1, severity: 5,
    },
  },
  {
    id: "C4", t: 279, lang: "es", phone: "+34 6•• ••• 650", gold: "C", aml: at("C", 80, 10, 35),
    transcript: "Árbol caído en el Paseo Marítimo, a la altura del Hospital Noble. Hay un coche debajo.",
    mock: {
      translation_es: null,
      summary_es: "Árbol caído con un coche debajo en el Paseo Marítimo (Hospital Noble).",
      incident_type: "arbol_caido", location_text: "Paseo Marítimo, Hospital Noble",
      keywords: ["árbol", "Paseo Marítimo", "coche", "Hospital Noble"],
      risks: ["via_bloqueada", "vehiculo_danado"], people_at_risk: 0, severity: 3,
    },
  },
  {
    id: "G3", t: 292, lang: "es", phone: "+34 6•• ••• 204", gold: "G", aml: at("G", -40, 20, 20),
    transcript:
      "Llamo desde Rincón. El garaje de mi edificio, en la avenida del Mediterráneo, está lleno de agua y mi vecino bajó hace diez minutos y no ha subido.",
    mock: {
      translation_es: null,
      summary_es: "Garaje lleno de agua en Av. del Mediterráneo; un vecino bajó hace 10 min y no ha vuelto.",
      incident_type: "garaje_inundado", location_text: "Avenida del Mediterráneo, Rincón de la Victoria",
      keywords: ["garaje", "Rincón", "avenida del Mediterráneo", "vecino", "no ha subido"],
      risks: ["vida", "agua_subiendo", "atrapados", "sin_respuesta"], people_at_risk: 1, severity: 5,
    },
  },
  {
    id: "A6", t: 305, lang: "en", phone: "+44 7••• ••• 318", gold: "A", aml: at("A", 90, 70, 150),
    transcript:
      "It's me again, about the car in the underpass in Campanillas. Are the firefighters coming? The water is up to the roof now.",
    mock: {
      translation_es:
        "Soy yo otra vez, por el coche del paso inferior de Campanillas. ¿Vienen los bomberos? El agua ya llega al techo.",
      summary_es: "Rellamada del testigo inglés: el agua llega al techo del coche del paso inferior.",
      incident_type: "inundacion_vehiculo", location_text: "Paso inferior, Campanillas",
      keywords: ["coche", "paso inferior", "Campanillas", "bomberos", "techo"],
      risks: ["vida", "atrapados", "agua_subiendo"], people_at_risk: 3, severity: 5,
    },
  },
  {
    id: "B4", t: 318, lang: "it", phone: "+39 3•• ••• 5528", gold: "B", aml: at("B", 40, -25, 70),
    transcript:
      "Pronto, sono un turista italiano, sono in via Cuarteles. C'è una casa allagata con una signora anziana dentro, non risponde.",
    mock: {
      translation_es:
        "Hola, soy un turista italiano, estoy en la calle Cuarteles. Hay una casa inundada con una señora mayor dentro, no responde.",
      summary_es: "Turista en c/ Cuarteles: casa inundada con una señora mayor dentro que no responde.",
      incident_type: "inundacion_vivienda", location_text: "Calle Cuarteles",
      keywords: ["calle Cuarteles", "casa inundada", "señora mayor", "no responde"],
      risks: ["vida", "mayor", "agua_subiendo", "sin_respuesta"], people_at_risk: 1, severity: 5,
    },
  },
  {
    id: "G4", t: 331, lang: "de", phone: "+49 17• ••• 6610", gold: "G", aml: at("G", 30, -30, 40),
    transcript:
      "Guten Tag, in Rincón de la Victoria läuft eine Tiefgarage voll Wasser, an der Avenida del Mediterráneo. Ein Mann ist unten und kommt nicht hoch.",
    mock: {
      translation_es:
        "Buenos días, en Rincón de la Victoria se está llenando de agua un garaje subterráneo, en la Avenida del Mediterráneo. Hay un hombre abajo y no sube.",
      summary_es: "Garaje subterráneo inundándose en Av. del Mediterráneo; un hombre abajo que no sube.",
      incident_type: "garaje_inundado", location_text: "Avenida del Mediterráneo, Rincón de la Victoria",
      keywords: ["garaje", "Rincón de la Victoria", "avenida del Mediterráneo", "hombre abajo"],
      risks: ["vida", "agua_subiendo", "atrapados", "sin_respuesta"], people_at_risk: 1, severity: 5,
    },
  },
];

export const scenario: Scenario = {
  id: "dana-malaga",
  name: "DANA en Málaga",
  place: "Málaga",
  calls: rows.map((r) => ({ ...r, mock: { ...r.mock, language: r.lang } })),
};
