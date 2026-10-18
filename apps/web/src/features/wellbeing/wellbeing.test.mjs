import test from "node:test";
import assert from "node:assert/strict";
import { validateWellbeingAnswers } from "./model.ts";
import { findPastoralAlerts } from "./alerts.ts";
import { eligibleReminderRecipients, brasiliaDate } from "./reminders.ts";

test("ratings must be between 1 and 5 and at least one is supplied", () => {
  assert.equal(validateWellbeingAnswers({ emotional: 5 }), true);
  assert.equal(validateWellbeingAnswers({}), false);
  assert.equal(validateWellbeingAnswers({ emotional: 0 }), false);
  assert.equal(validateWellbeingAnswers({ financial: 6 }), false);
  assert.equal(validateWellbeingAnswers({ emotional: 2.5 }), false);
});

test("alert requires consecutive dates and repeated low ratings", () => {
  const today = brasiliaDate(new Date());
  const day = (offset) => {
    const [year, month, date] = today.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, date + offset)).toISOString().slice(0, 10);
  };
  const row = (offset, emotional) => ({
    person_id: "person-A", checkin_date: day(offset),
    emotional, financial: null, sentimental: null, spiritual: null
  });
  assert.equal(findPastoralAlerts([row(0, 1), row(-1, 2), row(-2, 1)]).length, 1);
  assert.equal(findPastoralAlerts([row(0, 1), row(-2, 2), row(-3, 1)]).length, 0);
  assert.equal(findPastoralAlerts([row(0, 1), row(-1, 4), row(-2, 1)]).length, 0);
  assert.equal(findPastoralAlerts([row(-4, 1), row(-5, 1), row(-6, 1)]).length, 0);
  assert.equal(findPastoralAlerts([row(0, 1), row(-1, 2)], 2).length, 1);
});

test("reminder eligibility requires opt-in, token, no check-in, and deduplicates", () => {
  const base = { organization_id: "org-A", person_id: "person-A", daily_reminder_enabled: true, checked_in_today: false, push_token: "ExponentPushToken[test]" };
  const selected = eligibleReminderRecipients([
    base, base, { ...base, person_id: "person-B", daily_reminder_enabled: false },
    { ...base, person_id: "person-C", checked_in_today: true },
    { ...base, person_id: "person-D", push_token: null },
    { ...base, organization_id: "org-B" }
  ]);
  assert.equal(selected.length, 2);
});
