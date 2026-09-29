import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-10 text-zinc-950">
      <section className="mx-auto flex min-h-[75vh] max-w-4xl flex-col justify-center rounded-[2rem] border border-zinc-200 bg-white p-8 shadow-sm sm:p-14">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700">
          Nethanel Tecnologia
        </p>
        <h1 className="mt-4 max-w-2xl text-4xl font-bold tracking-tight sm:text-6xl">
          Nethanel Elo
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-zinc-600 sm:text-lg">
          Pessoas, igreja e tecnologia conectadas em uma experiência simples para
          cultos, equipes, comunicação, cuidado, Elo Kids e gestão.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/privacidade"
            className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-bold text-white"
          >
            Política de Privacidade
          </Link>
          <Link
            href="/excluir-conta"
            className="rounded-xl border border-zinc-300 bg-white px-5 py-3 text-sm font-bold text-zinc-900"
          >
            Excluir conta
          </Link>
        </div>
      </section>
    </main>
  );
}
