import Link from "next/link";

const shortcuts = [
  { icon: "▦", label: "Próximos cultos", href: "/agenda", tone: "bg-blue-50 text-blue-700" },
  { icon: "♧", label: "Departamentos", href: "/departamentos", tone: "bg-violet-50 text-violet-700" },
  { icon: "☑", label: "Escalas", href: "/escalas", tone: "bg-emerald-50 text-emerald-700" },
  { icon: "♡", label: "Meu bem-estar", href: "/meu-bem-estar", tone: "bg-rose-50 text-rose-700" },
  { icon: "♥", label: "Contribuir", href: "/contribuicoes", tone: "bg-orange-50 text-orange-700" },
  { icon: "▤", label: "Meu Elo", href: "/meu-bem-estar", tone: "bg-indigo-50 text-indigo-700" },
];
const nav = [
  { icon: "⌂", label: "Início", href: "/" },
  { icon: "▦", label: "Agenda", href: "/agenda" },
  { icon: "♧", label: "Meu Elo", href: "/meu-bem-estar" },
  { icon: "♧", label: "Avisos", href: "/avisos" },
  { icon: "♙", label: "Perfil", href: "/perfil" },
];
export default function ChurchInterfacePreview() {
  return (
    <main className="min-h-screen bg-[#f4f7fd] pb-28 text-[#0d2346]">
      <header className="bg-gradient-to-br from-[#082d72] via-[#0755b9] to-[#166cce] px-5 pb-8 pt-10 text-white">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <div className="flex items-center gap-3"><div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/80 bg-[#071f48] text-2xl font-bold">✝</div><div><p className="text-xs opacity-80">Igreja</p><h1 className="text-2xl font-extrabold tracking-tight">Elo</h1><p className="text-xs opacity-90">Uma igreja para todos!</p></div></div>
          <Link href="/painel" className="rounded-full border border-white/25 bg-white/15 px-4 py-2 text-xs font-semibold">Administrar</Link>
        </div>
      </header>
      <div className="mx-auto max-w-xl space-y-8 px-4 pt-5">
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#071b46] to-[#1167bb] px-6 py-9 text-white shadow-xl shadow-blue-900/10">
          <div className="absolute -right-7 -top-7 text-[140px] leading-none opacity-10">✝</div>
          <p className="relative text-3xl font-extrabold leading-tight">Bem-vindo ao<br/>nosso Elo!</p>
          <p className="relative mt-3 max-w-[250px] text-sm leading-relaxed text-blue-100">Conectando você com Deus e com a nossa igreja.</p>
        </section>
        <section><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-extrabold">Acesso rápido</h2><span className="text-sm font-semibold text-blue-700">Sua igreja</span></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{shortcuts.map((item)=><Link key={item.label} href={item.href} className="flex min-h-28 flex-col items-start justify-between rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[.98]"><span className={`flex h-11 w-11 items-center justify-center rounded-2xl text-2xl ${item.tone}`}>{item.icon}</span><span className="mt-3 text-sm font-bold leading-tight">{item.label}</span></Link>)}</div></section>
        <section><h2 className="mb-4 text-xl font-extrabold">Próximo culto</h2><div className="flex items-center gap-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm"><div className="rounded-2xl bg-blue-800 px-4 py-3 text-center text-white"><div className="text-xs font-semibold">EM BREVE</div><div className="text-2xl font-black">✝</div></div><div><h3 className="font-bold">Confira a agenda da igreja</h3><p className="mt-1 text-sm text-slate-500">Cultos, eventos e compromissos</p><Link href="/agenda" className="mt-2 inline-block text-sm font-semibold text-blue-700">Ver agenda →</Link></div></div></section>
        <section><h2 className="mb-4 text-xl font-extrabold">Comunicados</h2><Link href="/avisos" className="flex items-center justify-between rounded-[22px] border border-slate-200 bg-white p-5 text-sm shadow-sm"><span>🔔 &nbsp; Confira os avisos da sua igreja</span><span className="text-blue-700">›</span></Link></section>
        <p className="text-center text-xs text-slate-400">Prévia visual da interface • Os dados reais serão conectados após a validação</p>
      </div>
      <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgba(20,40,80,.05)] backdrop-blur"><div className="mx-auto grid max-w-xl grid-cols-5">{nav.map((item,i)=><Link href={item.href} key={item.label} className={`flex min-h-[70px] flex-col items-center justify-center gap-1 text-xs font-semibold ${i===0?"text-blue-700":"text-slate-500"}`}><span className="text-2xl">{item.icon}</span>{item.label}</Link>)}</div></nav>
    </main>
  );
}
