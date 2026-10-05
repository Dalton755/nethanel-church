export default function SubscriptionReturnPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-10 text-zinc-950">
      <section className="mx-auto flex min-h-[75vh] max-w-2xl flex-col justify-center rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm sm:p-14">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">
          ✓
        </div>

        <p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-sky-700">
          Nethanel Elo
        </p>

        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
          Assinatura recebida
        </h1>

        <p className="mt-5 text-base leading-8 text-zinc-600">
          A confirmação é automática. Assim que o Mercado Pago confirmar a
          assinatura, o plano da sua igreja será ativado no Elo sem precisar
          enviar comprovante ou solicitar liberação manual.
        </p>

        <div className="mt-7 rounded-2xl border border-sky-100 bg-sky-50 p-5">
          <p className="text-sm font-bold text-zinc-900">O que acontece agora?</p>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Volte ao aplicativo. A tela Plano e assinatura atualizará o status
            automaticamente quando a confirmação chegar.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="nethanelelo://"
            className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-bold text-white"
          >
            Voltar ao Elo
          </a>
          <a
            href="/"
            className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-bold text-zinc-900"
          >
            Página da Nethanel Elo
          </a>
        </div>

        <p className="mt-7 text-xs leading-5 text-zinc-500">
          Esta página não solicita dados de cartão. O pagamento e a cobrança
          recorrente são processados pelo Mercado Pago.
        </p>
      </section>
    </main>
  );
}
