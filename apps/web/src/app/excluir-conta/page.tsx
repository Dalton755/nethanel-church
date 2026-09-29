import type { Metadata } from "next";
import Link from "next/link";

import { DeleteAccountForm } from "./DeleteAccountForm";

export const metadata: Metadata = {
  title: "Excluir conta | Nethanel Elo",
  description: "Solicite a exclusão da sua conta Nethanel Elo.",
};

export default function DeleteAccountPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-10 text-zinc-950">
      <article className="mx-auto max-w-xl rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">
          Nethanel Elo
        </p>

        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          Excluir minha conta
        </h1>

        <p className="mt-4 text-sm leading-7 text-zinc-600">
          Informe o e-mail utilizado no Elo para iniciar a solicitação de
          exclusão. O pedido é verificado antes da remoção para evitar exclusões
          indevidas.
        </p>

        <div className="mt-5 rounded-2xl bg-zinc-100 p-4 text-xs leading-6 text-zinc-600">
          A exclusão abrange a conta e os dados pessoais associados quando
          aplicável. Informações que precisem ser preservadas por obrigação legal,
          segurança ou auditoria poderão ser mantidas pelo prazo necessário.
        </div>

        <DeleteAccountForm />

        <div className="mt-8 border-t border-zinc-200 pt-6">
          <Link
            href="/privacidade"
            className="text-sm font-semibold text-sky-700 underline underline-offset-4"
          >
            Ler a Política de Privacidade
          </Link>
        </div>
      </article>
    </main>
  );
}
