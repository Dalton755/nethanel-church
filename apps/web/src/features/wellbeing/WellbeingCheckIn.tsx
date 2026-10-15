"use client";

import { useState } from "react";
import { WELLBEING_AREAS, WELLBEING_CHOICES, validateWellbeingAnswers, type WellbeingAnswers } from "./model";

type Props = {
  initialAnswers?: WellbeingAnswers;
  onSave: (answers: WellbeingAnswers, wantsContact: boolean, note: string) => Promise<void>;
};

export function WellbeingCheckIn({ initialAnswers = {}, onSave }: Props) {
  const [answers, setAnswers] = useState<WellbeingAnswers>(initialAnswers);
  const [wantsContact, setWantsContact] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateWellbeingAnswers(answers) && !wantsContact) {
      setError("Escolha pelo menos uma resposta ou solicite uma conversa.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(answers, wantsContact, note.trim());
      setSaved(true);
    } catch {
      setError("Não foi possível salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-6 rounded-3xl bg-white p-5 text-slate-900 shadow-sm">
      <header>
        <h2 className="text-2xl font-semibold">💙 Como está seu coração hoje?</h2>
        <p className="mt-2 text-sm text-slate-600">Sua igreja se importa com você. Responda apenas o que desejar.</p>
      </header>
      {WELLBEING_AREAS.map((area) => (
        <fieldset key={area.key} className="space-y-3">
          <legend className="font-medium">{area.icon} {area.title}</legend>
          <div className="grid grid-cols-5 gap-2">
            {WELLBEING_CHOICES.map((choice) => {
              const selected = answers[area.key] === choice.value;
              return (
                <button key={choice.value} type="button"
                  aria-pressed={selected}
                  aria-label={area.title + ": " + choice.label}
                  onClick={() => { setSaved(false); setAnswers((current) => ({ ...current, [area.key]: choice.value })); }}
                  className={`flex min-h-16 flex-col items-center justify-center rounded-xl border p-1 text-xs ${selected ? "border-blue-600 bg-blue-50 ring-2 ring-blue-200" : "border-slate-200"}`}>
                  <span aria-hidden="true" className="text-2xl">{choice.emoji}</span>
                  <span>{choice.label}</span>
                </button>
              );
            })}
          </div>
          <button type="button" className="text-xs text-slate-500 underline"
            onClick={() => setAnswers((current) => {
              const updated = { ...current };
              delete updated[area.key];
              setSaved(false);
              return updated;
            })}>Prefiro não responder esta área</button>
        </fieldset>
      ))}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={wantsContact} onChange={(event) => setWantsContact(event.target.checked)} />
        Gostaria de conversar com alguém da equipe pastoral.
      </label>
      <label className="block text-sm font-medium">
        Gostaria de compartilhar algo? (opcional)
        <textarea maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)}
          className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 p-3" />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {saved && <p role="status" className="text-sm text-green-700">💙 Obrigado por compartilhar! Seu registro foi salvo.</p>}
      <button type="submit" disabled={saving} className="w-full rounded-xl bg-blue-700 p-3 font-semibold text-white disabled:opacity-50">
        {saving ? "Salvando..." : "Salvar meu dia"}
      </button>
    </form>
  );
}
