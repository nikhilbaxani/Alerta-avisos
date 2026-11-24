/** Frases rápidas pretraducidas (MEMORIA §11). Funcionan también en modo simulado. */
export interface Phrase {
  id: string;
  es: string;
  tr: Record<string, string>;
}

export const PHRASES: Phrase[] = [
  {
    id: "calma",
    es: "Mantenga la calma, la ayuda está en camino.",
    tr: {
      en: "Stay calm, help is on the way.",
      de: "Bleiben Sie ruhig, Hilfe ist unterwegs.",
      fr: "Restez calme, les secours arrivent.",
      ar: "حافظ على هدوئك، المساعدة في الطريق.",
      it: "Mantenga la calma, i soccorsi stanno arrivando.",
    },
  },
  {
    id: "heridos",
    es: "¿Hay alguien herido?",
    tr: {
      en: "Is anyone injured?",
      de: "Ist jemand verletzt?",
      fr: "Y a-t-il des blessés ?",
      ar: "هل هناك أي مصاب؟",
      it: "C'è qualcuno ferito?",
    },
  },
  {
    id: "direccion",
    es: "¿Me puede decir la dirección exacta?",
    tr: {
      en: "Can you tell me the exact address?",
      de: "Können Sie mir die genaue Adresse sagen?",
      fr: "Pouvez-vous me donner l'adresse exacte ?",
      ar: "هل يمكنك أن تخبرني بالعنوان الدقيق؟",
      it: "Può dirmi l'indirizzo esatto?",
    },
  },
  {
    id: "garaje",
    es: "No baje al garaje ni entre en el agua. Suba a una planta alta.",
    tr: {
      en: "Do not go down to the garage or into the water. Go to a higher floor.",
      de: "Gehen Sie nicht in die Garage und nicht ins Wasser. Gehen Sie in ein höheres Stockwerk.",
      fr: "Ne descendez pas au garage et n'entrez pas dans l'eau. Montez à un étage supérieur.",
      ar: "لا تنزل إلى المرآب ولا تدخل الماء. اصعد إلى طابق أعلى.",
      it: "Non scenda in garage e non entri nell'acqua. Salga a un piano più alto.",
    },
  },
  {
    id: "respira",
    es: "¿La persona respira? ¿Está consciente?",
    tr: {
      en: "Is the person breathing? Are they conscious?",
      de: "Atmet die Person? Ist sie bei Bewusstsein?",
      fr: "La personne respire-t-elle ? Est-elle consciente ?",
      ar: "هل الشخص يتنفس؟ هل هو واعٍ؟",
      it: "La persona respira? È cosciente?",
    },
  },
  {
    id: "cables",
    es: "Aléjese de los cables del suelo.",
    tr: {
      en: "Keep away from the cables on the ground.",
      de: "Halten Sie Abstand zu den Kabeln am Boden.",
      fr: "Éloignez-vous des câbles au sol.",
      ar: "ابتعد عن الأسلاك الموجودة على الأرض.",
      it: "Si allontani dai cavi a terra.",
    },
  },
];

/** Frases fijas del asistente de espera (X06, MEMORIA §16.3), en el orden habitual del guion. */
export const WAITING_PHRASE_IDS = ["asistente", "que_ocurre", "escalado", "calma_espera", "en_cola", "ya_avisado"] as const;
export type WaitingPhraseId = (typeof WAITING_PHRASE_IDS)[number];

/**
 * Frases del asistente que atiende a quien está en espera (X06). Exportación aparte a propósito: la
 * consola pinta un botón por cada elemento de `PHRASES` y la interfaz no se toca. Las traducciones no
 * vienen de MEMORIA §11: están escritas para el proyecto y anotadas en DECISIONES (X06).
 */
export const WAITING_PHRASES: readonly (Phrase & { id: WaitingPhraseId })[] = [
  {
    // Transparencia (Ley de IA): dice que es un asistente automático y que un operador le atenderá.
    id: "asistente",
    es: "Le atiende el asistente automático del 112. Todos los operadores están ocupados y uno le atenderá lo antes posible.",
    tr: {
      en: "You are speaking to the 112 automated assistant. All operators are busy and one of them will answer you as soon as possible.",
      de: "Sie sprechen mit dem automatischen Assistenten des Notrufs 112. Alle Mitarbeiter sind im Gespräch; ein Mitarbeiter übernimmt Ihren Anruf so schnell wie möglich.",
      fr: "Vous êtes en ligne avec l'assistant automatique du 112. Tous les opérateurs sont occupés ; l'un d'eux vous répondra dès que possible.",
      ar: "أنت تتحدث مع المساعد الآلي لخدمة الطوارئ 112. جميع الموظفين مشغولون الآن، وسيرد عليك أحدهم في أقرب وقت ممكن.",
      it: "Risponde l'assistente automatico del 112. Tutti gli operatori sono occupati; uno di loro le risponderà il prima possibile.",
    },
  },
  {
    id: "que_ocurre",
    es: "Dígame qué ocurre y dónde está.",
    tr: {
      en: "Tell me what is happening and where you are.",
      de: "Sagen Sie mir, was passiert und wo Sie sind.",
      fr: "Dites-moi ce qui se passe et où vous êtes.",
      ar: "أخبرني ماذا يحدث وأين أنت.",
      it: "Mi dica cosa succede e dove si trova.",
    },
  },
  {
    // Escalado inmediato ante riesgo vital.
    id: "escalado",
    es: "Le paso con un operador ahora mismo. No cuelgue.",
    tr: {
      en: "I am putting you through to an operator right now. Do not hang up.",
      de: "Ich verbinde Sie sofort mit einem Mitarbeiter. Legen Sie nicht auf.",
      fr: "Je vous passe un opérateur tout de suite. Ne raccrochez pas.",
      ar: "أحوّل مكالمتك فوراً إلى أحد الموظفين. لا تُغلق الخط.",
      it: "La passo subito a un operatore. Non riattacchi.",
    },
  },
  {
    // Sustituye a «calma» cuando ningún operador ha cogido aún la emergencia: no promete que la ayuda esté en camino.
    id: "calma_espera",
    es: "Mantenga la calma.",
    tr: {
      en: "Stay calm.",
      de: "Bleiben Sie ruhig.",
      fr: "Restez calme.",
      ar: "حافظ على هدوئك.",
      it: "Mantenga la calma.",
    },
  },
  {
    id: "en_cola",
    es: "He tomado nota. No cuelgue: un operador le atenderá en cuanto quede libre.",
    tr: {
      en: "I have taken note. Do not hang up: an operator will answer you as soon as one is free.",
      de: "Ich habe alles notiert. Legen Sie nicht auf: Ein Mitarbeiter übernimmt Ihren Anruf, sobald er frei ist.",
      fr: "J'ai tout noté. Ne raccrochez pas : un opérateur vous répondra dès qu'il sera libre.",
      ar: "سجّلتُ ما قلته. لا تُغلق الخط، سيرد عليك أحد الموظفين حالما يصبح متاحاً.",
      it: "Ho preso nota. Non riattacchi: un operatore le risponderà appena sarà libero.",
    },
  },
  {
    // Duplicado sin información nueva: se cierra sin ocupar a un operador. No dice que un operador la esté
    // atendiendo: puede que la primera llamada de esa emergencia siga en la cola.
    id: "ya_avisado",
    es: "Ya tenemos el aviso de esta emergencia: no hace falta que espere. Si la situación empeora, vuelva a llamar al 112.",
    tr: {
      en: "We already have a report of this emergency, so you do not need to wait. If the situation gets worse, call 112 again.",
      de: "Dieser Notfall ist uns bereits gemeldet; Sie müssen nicht warten. Wenn sich die Lage verschlechtert, rufen Sie erneut die 112 an.",
      fr: "Nous avons déjà le signalement de cette urgence : inutile d'attendre. Si la situation s'aggrave, rappelez le 112.",
      ar: "لقد تلقّينا بلاغاً عن هذه الحالة الطارئة، فلا داعي للانتظار. إذا ساء الوضع، اتصل بالرقم 112 مرة أخرى.",
      it: "Abbiamo già la segnalazione di questa emergenza: non serve che resti in attesa. Se la situazione peggiora, richiami il 112.",
    },
  },
];

export const SPEECH_LOCALE: Record<string, string> = {
  es: "es-ES",
  en: "en-GB",
  de: "de-DE",
  fr: "fr-FR",
  ar: "ar-SA",
  it: "it-IT",
};
