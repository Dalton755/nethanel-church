"use client";

import { FormEvent, useState } from "react";

import { createClient } from "../../lib/supabase/client";

export function DeleteAccountForm() {
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const supabase = createClient();

      const { data, error } = await supabase.rpc(
        "request_account_deletion_by_email",
        {
          p_email: email,
          p_reason: reason.trim() || null,
        }
      );

      if (error) {
        throw error;
      }

      setMessage(
        (data as { message?: string } | null)?.message ??
          "Solicitação registrada."
      );
      setEmail("");
      setReason("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar a solicitação."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <div>
        <label htmlFor="email" className="text-sm font-semibold text-zinc-900">
          E-mail usado no Elo
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none ring-sky-600 focus:ring-2"
          placeholder="seuemail@exemplo.com"
        />
      </div>

      <div>
        <label htmlFor="reason" className="text-sm font-semibold text-zinc-900">
          Motivo (opcional)
        </label>
        <textarea
          id="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={1000}
          rows={4}
          className="mt-2 w-full resize-none rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none ring-sky-600 focus:ring-2"
          placeholder="Conte o motivo se quiser."
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-red-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
      >
        {loading ? "Enviando..." : "Solicitar exclusão da conta"}
      </button>

      {message ? (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
          {message}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-800">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
