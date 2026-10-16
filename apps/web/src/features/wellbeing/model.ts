export type WellbeingArea = "emotional" | "financial" | "sentimental" | "spiritual";
export type WellbeingRating = 1 | 2 | 3 | 4 | 5;

export const WELLBEING_AREAS: { key: WellbeingArea; title: string; icon: string }[] = [
  { key: "emotional", title: "Emocional", icon: "❤️" },
  { key: "financial", title: "Financeiro", icon: "💰" },
  { key: "sentimental", title: "Sentimental", icon: "💕" },
  { key: "spiritual", title: "Espiritual", icon: "🙏" },
];

export const WELLBEING_CHOICES: { value: WellbeingRating; emoji: string; label: string }[] = [
  { value: 5, emoji: "😄", label: "Muito bem" },
  { value: 4, emoji: "🙂", label: "Bem" },
  { value: 3, emoji: "😐", label: "Regular" },
  { value: 2, emoji: "😔", label: "Difícil" },
  { value: 1, emoji: "😢", label: "Muito difícil" },
];

export type WellbeingAnswers = Partial<Record<WellbeingArea, WellbeingRating>>;

export function validateWellbeingAnswers(answers: WellbeingAnswers): boolean {
  const values = Object.values(answers);
  return values.length > 0 && values.every(
    (value) => Number.isInteger(value) && value! >= 1 && value! <= 5
  );
}
