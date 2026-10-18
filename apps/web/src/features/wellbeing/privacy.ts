export const WELLBEING_PRIVACY = {
  voluntary: true,
  pastoralSharingDefault: false,
  reminderOptInDefault: false,
  timezone: 'America/Sao_Paulo',
  reminderHour: 10,
  maximumNoteLength: 1000,
} as const;

export function isValidCheckinDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
