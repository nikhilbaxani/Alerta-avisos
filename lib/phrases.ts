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

export const SPEECH_LOCALE: Record<string, string> = {
  es: "es-ES",
  en: "en-GB",
  de: "de-DE",
  fr: "fr-FR",
  ar: "ar-SA",
  it: "it-IT",
};
