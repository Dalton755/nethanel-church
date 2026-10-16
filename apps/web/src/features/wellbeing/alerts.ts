import type { WellbeingAnswers } from "./model";

export type TrendEntry = {
  checkin_date: string;
  person_id: string;
  emotional: number | null;
  financial: number | null;
  sentimental: number | null;
  spiritual: number | null;
};

export type PastoralAlert = {
  personId: string;
  area: keyof WellbeingAnswers;
  consecutiveDays: number;
  latestDate: string;
};

const areas = ["emotional", "financial", "sentimental", "spiritual"] as const;

function utcDay(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = Date.parse(date + "T00:00:00Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date
    ? Math.floor(parsed / 86400000) : null;
}

/**
 * Only explicitly shared entries should be passed here, after RLS filtering.
 * Alerts describe a repeated pattern; they are not diagnoses.
 */
export function findPastoralAlerts(entries: TrendEntry[], threshold = 3, lowRating = 2): PastoralAlert[] {
  if (!Number.isInteger(threshold) || threshold < 2) throw new Error("Invalid threshold");
  const byPerson = new Map<string, TrendEntry[]>();
  for (const entry of entries) {
    if (!byPerson.has(entry.person_id)) byPerson.set(entry.person_id, []);
    byPerson.get(entry.person_id)!.push(entry);
  }
  const alerts: PastoralAlert[] = [];
  for (const [personId, records] of byPerson) {
    const sorted = [...records].sort((a, b) => b.checkin_date.localeCompare(a.checkin_date));
    const todayParts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const part = (type: string) => todayParts.find((item) => item.type === type)?.value ?? "";
    const today = utcDay(`${part("year")}-${part("month")}-${part("day")}`);
    const latest = utcDay(sorted[0]?.checkin_date ?? "");
    if (today === null || latest === null || today - latest > 1 || latest > today) continue;
    for (const area of areas) {
      let previousDay: number | null = null;
      let count = 0;
      for (const record of sorted) {
        const day = utcDay(record.checkin_date);
        const value = record[area];
        if (day === null || value === null || value > lowRating) break;
        if (previousDay !== null && previousDay - day !== 1) break;
        count++;
        previousDay = day;
      }
      if (count >= threshold) alerts.push({ personId, area, consecutiveDays: count, latestDate: sorted[0].checkin_date });
    }
  }
  return alerts;
}
