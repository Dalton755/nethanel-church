/** Pure selection logic for a trusted, authenticated daily notification worker. */
export type ReminderCandidate = {
  person_id: string;
  organization_id: string;
  daily_reminder_enabled: boolean;
  checked_in_today: boolean;
  push_token: string | null;
};
export function eligibleReminderRecipients(candidates: ReminderCandidate[]): ReminderCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (!candidate.daily_reminder_enabled || candidate.checked_in_today || !candidate.push_token) return false;
    const key = candidate.organization_id + ":" + candidate.person_id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function brasiliaDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return [value("year"), value("month"), value("day")].join("-");
}
