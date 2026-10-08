"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import Link from "next/link";
import { createClient } from "../../lib/supabase/client";
import { DEPARTMENT_PRESETS, MINISTRY_PRESETS, type DepartmentPreset, type Ministry } from "../../lib/church-presets";

type Church = {
  id: string;
  name: string;
  person: { id: string };
  units: Array<{ id: string; name: string; is_headquarters: boolean }>;
  roles: Array<{ role_key: string; is_owner: boolean }>;
};
type Plan = { name: string; effective_plan_code: string; features: Record<string, boolean | string | null> };
type Branding = {
  app_name?: string; logo_url?: string | null; app_icon_url?: string | null;
  splash_url?: string | null; primary_color?: string;
  secondary_color?: string; background_color?: string;
};
type Structure = {
  configured: boolean; estimated_members: number | null;
  ministry_scope: "local" | "congregations" | "regional" | "missions";
  departments: Array<{ key: string; name: string; estimated_people: number; functions?: { name: string; required_count: number }[] }>;
  ministries: Ministry[];
};
type Build = {
  id: string; status: "queued" | "building" | "ready" | "failed";
  artifact_path: string | null; created_at: string;
  failure_reason: string | null; android_package: string; branded_push: boolean;
};

const COLORS = ["#2387C9", "#406A85", "#556CCF", "#8064C4", "#3B8F75", "#D0A53A", "#AF5B6D", "#202B39"];
const STEPS = ["Sua marca", "Departamentos", "Ministérios", "Meu aplicativo"];
const SCOPES: Array<{ key: Structure["ministry_scope"]; title: string; description: string }> = [
  { key: "local", title: "Igreja local", description: "Uma comunidade e uma sede" },
  { key: "congregations", title: "Sede e congregações", description: "Unidades e equipes independentes" },
  { key: "regional", title: "Campo ou região", description: "Supervisão de igrejas" },
  { key: "missions", title: "Missões", description: "Frentes de evangelização e missões" },
];
const defaultBrand = { primary: "#2387C9", secondary: "#DCE9F3", background: "#F6F8FB" };
function cleanKey(name: string) {
  return "custom_" + name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
}
function isHex(value: string) { return /^#[0-9a-fA-F]{6}$/.test(value); }
function readableError(error: unknown) { return error instanceof Error ? error.message : "Não foi possível concluir. Tente novamente."; }
const inputClass = "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100";
const cardClass = "rounded-[1.5rem] border border-slate-200/90 bg-white p-5 shadow-[0_14px_60px_-48px_#1e293b] sm:p-7";
const primaryButton = "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#1a3044] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#2b4c68] disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50";

export default function ChurchStudioPage() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [churches, setChurches] = useState<Church[]>([]);
  const [church, setChurch] = useState<Church | null>(null);
  const [newChurchName, setNewChurchName] = useState("");
  const [unitName, setUnitName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [churchName, setChurchName] = useState("");
  const [appName, setAppName] = useState("");
  const [primary, setPrimary] = useState(defaultBrand.primary);
  const [secondary, setSecondary] = useState(defaultBrand.secondary);
  const [background, setBackground] = useState(defaultBrand.background);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [splashUrl, setSplashUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [splashFile, setSplashFile] = useState<File | null>(null);
  const [estimatedMembers, setEstimatedMembers] = useState("");
  const [chosenDepartments, setChosenDepartments] = useState<Record<string, string>>({});
  const [customDepartments, setCustomDepartments] = useState<DepartmentPreset[]>([]);
  const [customDepartmentName, setCustomDepartmentName] = useState("");
  const [search, setSearch] = useState("");
  const [ministryScope, setMinistryScope] = useState<Structure["ministry_scope"]>("local");
  const [chosenMinistries, setChosenMinistries] = useState<Record<string, Ministry>>({});
  const [customMinistries, setCustomMinistries] = useState<Ministry[]>([]);
  const [newMinistryName, setNewMinistryName] = useState("");
  const [builds, setBuilds] = useState<Build[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const supabase = createClient();
      setClient(supabase);
      void supabase.auth.getUser().then(({ data }) => {
        setUser(data.user);
        setBooting(false);
      }).catch(() => setBooting(false));
      const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });
      return () => subscription.subscription.unsubscribe();
    } catch (err) {
      setError("O ambiente web precisa das variáveis públicas do Supabase configuradas.");
      setBooting(false);
    }
  }, []);

  const loadChurches = useCallback(async () => {
    if (!client) return;
    const { data, error: apiError } = await client.rpc("get_my_context");
    if (apiError) throw apiError;
    const next: Church[] = Array.isArray(data?.organizations) ? data.organizations : [];
    setChurches(next);
    return next;
  }, [client]);

  useEffect(() => {
    if (!client || !user) { setChurches([]); setChurch(null); return; }
    void loadChurches().catch((err) => setError(readableError(err)));
  }, [client, user, loadChurches]);

  const loadBuilds = useCallback(async (orgId: string) => {
    if (!client) return;
    const { data, error: loadError } = await client.from("church_apk_builds")
      .select("id,status,artifact_path,created_at,failure_reason,android_package,branded_push")
      .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(5);
    if (loadError) return;
    setBuilds((data ?? []) as Build[]);
  }, [client]);

  const selectChurch = useCallback(async (next: Church) => {
    if (!client) return;
    setError(""); setMessage(""); setChurch(next); setChurchName(next.name);
    setStep(0); setBuilds([]);
    try {
      const unit = next.units.find((u) => u.is_headquarters) ?? next.units[0];
      if (!unit) throw new Error("A igreja ainda não possui uma unidade.");
      const [planRes, brandRes, structRes] = await Promise.all([
        client.rpc("get_organization_plan_context", { p_organization_id: next.id }),
        client.rpc("get_my_branding_context"),
        client.rpc("get_church_structure", { p_organization_id: next.id, p_unit_id: unit.id }),
      ]);
      if (planRes.error) throw planRes.error;
      if (structRes.error) throw structRes.error;
      setPlan(planRes.data as Plan);
      const brandItem = brandRes.data?.organizations?.find((o: { organization_id: string }) => o.organization_id === next.id) as Branding | undefined;
      setAppName(brandItem?.app_name || next.name);
      setLogoUrl(brandItem?.logo_url ?? null);
      setIconUrl(brandItem?.app_icon_url ?? null);
      setSplashUrl(brandItem?.splash_url ?? null);
      setPrimary(brandItem?.primary_color ?? defaultBrand.primary);
      setSecondary(brandItem?.secondary_color ?? defaultBrand.secondary);
      setBackground(brandItem?.background_color ?? defaultBrand.background);
      setLogoFile(null); setIconFile(null); setSplashFile(null);
      const settings = structRes.data as Structure;
      setEstimatedMembers(settings.estimated_members == null ? "" : String(settings.estimated_members));
      setMinistryScope(settings.ministry_scope || "local");
      setChosenDepartments(Object.fromEntries(settings.departments.map(d => [d.key, String(d.estimated_people ?? 0)])));
      setCustomDepartments(settings.departments.filter(d => !DEPARTMENT_PRESETS.some(p => p.key === d.key))
        .map(d => ({ key: d.key, name: d.name, category: "Personalizados", functions: d.functions?.length ? d.functions : [{ name: "Voluntário", required_count: 1 }] })));
      setChosenMinistries(Object.fromEntries(settings.ministries.map(m => [m.key, m])));
      setCustomMinistries(settings.ministries.filter(m => !MINISTRY_PRESETS.some(p => p.key === m.key)));
      await loadBuilds(next.id);
    } catch (err) {
      setError(readableError(err));
    }
  }, [client, loadBuilds]);

  useEffect(() => {
    if (!church || !client) return;
    const timer = window.setInterval(() => { void loadBuilds(church.id); }, 20000);
    return () => window.clearInterval(timer);
  }, [church, client, loadBuilds]);

  const features = plan?.features ?? {};
  const canColors = features.custom_colors === true;
  const canAppName = features.custom_app_name === true;
  const canIcon = features.custom_launcher_icon === true;
  const canSplash = features.custom_splash === true;
  const canApk = features.standalone_apk === true;
  const brandedPush = features.branded_push === true;
  const departments = useMemo(() => [...DEPARTMENT_PRESETS, ...customDepartments], [customDepartments]);
  const activeDepts = departments.filter(d => chosenDepartments[d.key] !== undefined);
  const showKids = activeDepts.some(d => d.key === "infantil");
  const previewLogo = useMemo(() => logoFile && typeof window !== "undefined"
    ? URL.createObjectURL(logoFile) : logoUrl, [logoFile, logoUrl]);
  useEffect(() => {
    const u = previewLogo;
    return () => { if (u?.startsWith("blob:")) URL.revokeObjectURL(u); };
  }, [previewLogo]);
  const show = (text: string) => { setMessage(text); setError(""); };
  const fail = (err: unknown) => { setError(readableError(err)); setMessage(""); };

  async function authenticate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!client) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = authMode === "signup"
        ? await client.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/painel" } })
        : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (authMode === "signup" && !result.data.session) show("Conta criada. Confirme seu e-mail para acessar o estúdio.");
    } catch (err) { fail(err); } finally { setBusy(false); }
  }

  async function googleLogin() {
    if (!client) return;
    setError("");
    const { error: e } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/painel" },
    });
    if (e) fail(e);
  }

  async function createChurch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!client || newChurchName.trim().length < 2) return;
    setBusy(true); setError("");
    try {
      const { data, error: createError } = await client.rpc("create_organization_with_code", {
        p_name: newChurchName.trim(), p_unit_name: unitName.trim() || null, p_slug: null,
      });
      if (createError) throw createError;
      setJoinCode(data?.join_code ?? "");
      const next = await loadChurches();
      const created = next?.find(c => c.id === data?.organization_id);
      if (created) await selectChurch(created);
    } catch (err) { fail(err); } finally { setBusy(false); }
  }

  async function uploadAsset(kind: "logo" | "app-icon" | "splash", file: File | null, oldUrl: string | null) {
    if (!client || !church || !file) return oldUrl;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size < 1024)
      throw new Error("Use imagem PNG, JPG ou WEBP válida, até 5 MB.");
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = church.id + "/" + kind + "." + ext;
    const { error: uploadError } = await client.storage.from("church-branding")
      .upload(path, file, { upsert: true, contentType: file.type, cacheControl: "60" });
    if (uploadError) throw uploadError;
    const { data } = client.storage.from("church-branding").getPublicUrl(path);
    return data.publicUrl + "?v=" + Date.now();
  }

  async function saveBrand() {
    if (!client || !church) return;
    if (churchName.trim().length < 2) { setError("Informe o nome da igreja."); return; }
    if (canAppName && (appName.trim().length < 2 || appName.length > 40)) {
      setError("O nome do aplicativo deve ter entre 2 e 40 caracteres."); return;
    }
    if (canColors && ![primary, secondary, background].every(isHex)) {
      setError("Use cores válidas no formato #123ABC."); return;
    }
    setBusy(true); setError("");
    try {
      const [newLogo, newIcon, newSplash] = await Promise.all([
        uploadAsset("logo", logoFile, logoUrl),
        canIcon ? uploadAsset("app-icon", iconFile, iconUrl) : Promise.resolve(null),
        canSplash ? uploadAsset("splash", splashFile, splashUrl) : Promise.resolve(null),
      ]);
      const { error: saveError } = await client.rpc("save_organization_branding_v2", {
        p_organization_id: church.id, p_name: churchName.trim(),
        p_app_name: canAppName ? appName.trim() : null,
        p_primary_color: canColors ? primary.toUpperCase() : defaultBrand.primary,
        p_secondary_color: canColors ? secondary.toUpperCase() : defaultBrand.secondary,
        p_background_color: canColors ? background.toUpperCase() : defaultBrand.background,
        p_logo_url: newLogo, p_app_icon_url: canIcon ? newIcon : null,
        p_splash_url: canSplash ? newSplash : null,
      });
      if (saveError) throw saveError;
      setLogoUrl(newLogo); setIconUrl(newIcon); setSplashUrl(newSplash);
      setLogoFile(null); setIconFile(null); setSplashFile(null);
      setStep(1); show("Identidade salva. Agora escolha os departamentos.");
      void loadChurches();
    } catch (err) { fail(err); } finally { setBusy(false); }
  }

  function toggleDepartment(key: string) {
    setChosenDepartments(current => {
      const next = { ...current };
      if (next[key] === undefined) next[key] = "0";
      else delete next[key];
      return next;
    });
  }
  function addCustomDepartment() {
    const name = customDepartmentName.trim();
    if (name.length < 2 || name.length > 80) return;
    const key = cleanKey(name);
    if (departments.some(d => d.key === key)) return;
    setCustomDepartments(current => [...current, { key, name, category: "Personalizados", functions: [{ name: "Voluntário", required_count: 1 }] }]);
    setChosenDepartments(current => ({ ...current, [key]: "0" }));
    setCustomDepartmentName("");
  }
  function addMinistry() {
    const name = newMinistryName.trim();
    if (name.length < 2 || name.length > 80) return;
    const key = cleanKey(name);
    if (chosenMinistries[key] || MINISTRY_PRESETS.some(m => m.key === key)) return;
    const item = { key, name };
    setCustomMinistries(current => [...current, item]);
    setChosenMinistries(current => ({ ...current, [key]: item }));
    setNewMinistryName("");
  }

  async function saveStructure() {
    if (!client || !church) return;
    const unit = church.units.find(u => u.is_headquarters) ?? church.units[0];
    if (!unit) { setError("Unidade não localizada."); return; }
    setBusy(true); setError("");
    try {
      const count = estimatedMembers.trim() ? Number(estimatedMembers) : null;
      if (count !== null && (!Number.isInteger(count) || count < 0 || count > 1_000_000))
        throw new Error("Quantidade de membros inválida.");
      const data = activeDepts.map(d => {
        const total = Number(chosenDepartments[d.key] || "0");
        if (!Number.isInteger(total) || total < 0 || total > 100000)
          throw new Error("Confira a quantidade da equipe de " + d.name);
        return { key: d.key, name: d.name, estimated_people: total, functions: d.functions };
      });
      const { error: apiError } = await client.rpc("save_church_structure", {
        p_organization_id: church.id, p_unit_id: unit.id,
        p_estimated_members: count, p_ministry_scope: ministryScope,
        p_departments: data, p_ministries: Object.values(chosenMinistries),
      });
      if (apiError) throw apiError;
      setStep(3); show("Estrutura salva. O painel e o motor de escalas usam suas escolhas.");
    } catch (err) { fail(err); } finally { setBusy(false); }
  }

  async function requestApk() {
    if (!client || !church || !canApk) return;
    const unit = church.units.find(u => u.is_headquarters) ?? church.units[0];
    if (!unit) return;
    setBusy(true); setError("");
    try {
      const { error: apiError } = await client.rpc("request_church_apk", {
        p_organization_id: church.id, p_unit_id: unit.id,
      });
      if (apiError) throw apiError;
      await loadBuilds(church.id);
      show("Solicitação registrada. A fábrica de aplicativos exibirá aqui o resultado da compilação.");
    } catch (err) { fail(err); } finally { setBusy(false); }
  }

  async function downloadApk(build: Build) {
    if (!client || !build.artifact_path) return;
    setBusy(true);
    try {
      const { data, error: signedError } = await client.storage.from("elo-church-apks")
        .createSignedUrl(build.artifact_path, 600);
      if (signedError) throw signedError;
      if (!data?.signedUrl) throw new Error("Download temporariamente indisponível.");
      window.location.assign(data.signedUrl);
    } catch (err) { fail(err); } finally { setBusy(false); }
  }

  const page = !user ? "auth" : !church ? "church" : "studio";
  return (
    <main className="min-h-screen bg-[#f5f7f7] text-[#1e3040]">
      <header className="border-b border-slate-200/70 bg-white/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4">
          <Link href="/" className="flex items-center gap-3 font-extrabold tracking-tight">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#1a3044] text-lg text-amber-200">E</span>
            <span>Nethanel <span className="font-medium text-sky-700">Elo</span></span>
          </Link>
          <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
            <span className="hidden sm:block">Estúdio da igreja</span>
            {user && <button onClick={() => { setChurch(null); setMessage(""); }} className="rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50">Trocar igreja</button>}
            {user && <button onClick={() => { void client?.auth.signOut(); setChurch(null); }} className="rounded-xl px-2 py-2 text-red-600">Sair</button>}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-9 sm:py-12">
        {booting ? <div className={cardClass}>Abrindo seu estúdio…</div> : null}
        {!booting && page === "auth" ? (
          <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_0.9fr]">
            <div className="flex flex-col justify-center py-7">
              <p className="mb-4 text-xs font-black uppercase tracking-[0.22em] text-sky-600">Sua igreja. Sua identidade.</p>
              <h1 className="max-w-lg text-4xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">
                Um Elo feito para a <span className="text-sky-600">sua comunidade.</span>
              </h1>
              <p className="mt-5 max-w-lg leading-8 text-slate-500">Crie sua igreja, escolha os departamentos, configure os ministérios e visualize o aplicativo com sua marca. Nos planos habilitados, solicite um APK próprio.</p>
              <div className="mt-8 grid grid-cols-2 gap-3 text-sm">
                {["Departamentos sob medida", "Escalas já preparadas", "Identidade da sua igreja", "Seu APK nos planos elegíveis"].map(t =>
                  <div key={t} className="flex gap-2 rounded-2xl bg-white p-3 font-semibold"><span className="text-emerald-600">✓</span>{t}</div>
                )}
              </div>
            </div>
            <div className={cardClass}>
              <p className="text-xs font-bold uppercase tracking-widest text-sky-600">Comece por aqui</p>
              <h2 className="mt-3 text-2xl font-extrabold">{authMode === "signup" ? "Criar minha conta" : "Entrar no Elo"}</h2>
              <p className="mt-2 text-sm text-slate-500">O primeiro administrador poderá configurar sua igreja.</p>
              <form onSubmit={authenticate} className="mt-6 grid gap-3">
                <label className="text-xs font-bold text-slate-600">E-mail<input className={inputClass + " mt-1.5"} type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
                <label className="text-xs font-bold text-slate-600">Senha<input className={inputClass + " mt-1.5"} type="password" minLength={6} required value={password} onChange={e => setPassword(e.target.value)} autoComplete={authMode === "signup" ? "new-password" : "current-password"} /></label>
                <button className={primaryButton + " w-full"} disabled={busy || !client}>{busy ? "Entrando..." : authMode === "signup" ? "Criar conta gratuita" : "Entrar"}</button>
              </form>
              <button onClick={() => void googleLogin()} className={secondaryButton + " mt-3 w-full"}>Continuar com Google</button>
              <button className="mt-5 w-full text-sm font-semibold text-sky-700" onClick={() => setAuthMode(v => v === "signup" ? "login" : "signup")}>{authMode === "signup" ? "Já tenho conta — entrar" : "Não tenho conta — cadastrar"}</button>
            </div>
          </div>
        ) : null}

        {!booting && page === "church" ? (
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
            <section className={cardClass}>
              <p className="text-xs font-bold uppercase tracking-widest text-sky-600">Nova igreja</p>
              <h1 className="mt-3 text-2xl font-extrabold">Vamos começar?</h1>
              <p className="my-4 text-sm leading-6 text-slate-500">Cadastre a sede. Você será o primeiro administrador e terá acesso ao configurador.</p>
              <form onSubmit={createChurch} className="grid gap-3">
                <label className="text-xs font-bold">Nome da igreja<input required minLength={2} maxLength={120} className={inputClass + " mt-1.5"} value={newChurchName} onChange={e => setNewChurchName(e.target.value)} placeholder="Ex.: Assembleia de Deus Central" /></label>
                <label className="text-xs font-bold">Nome da sede (opcional)<input className={inputClass + " mt-1.5"} value={unitName} onChange={e => setUnitName(e.target.value)} placeholder="Ex.: Sede" /></label>
                <button className={primaryButton} disabled={busy}>{busy ? "Criando..." : "Cadastrar igreja →"}</button>
              </form>
            </section>
            <section className={cardClass}>
              <h2 className="text-lg font-extrabold">Minhas igrejas</h2>
              <p className="mt-1 text-sm text-slate-500">Retome uma personalização existente.</p>
              <div className="mt-5 grid gap-3">
                {churches.length ? churches.map(c =>
                  <button key={c.id} onClick={() => void selectChurch(c)} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left hover:border-sky-300">
                    <span className="font-bold">{c.name}</span><span className="text-sky-600">→</span>
                  </button>
                ) : <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">Nenhuma igreja cadastrada nesta conta.</p>}
              </div>
            </section>
          </div>
        ) : null}

        {!booting && page === "studio" && church ? (
          <div className="grid gap-7 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
            <aside className="h-fit lg:sticky lg:top-6">
              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <p className="px-2 text-[11px] font-black uppercase tracking-[0.16em] text-sky-700">Configuração</p>
                <h2 className="my-4 px-2 text-lg font-black">{church.name}</h2>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                  {STEPS.map((title, index) =>
                    <button key={title} onClick={() => { setStep(index); setError(""); setMessage(""); }}
                      className={"flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-xs font-bold transition sm:text-sm " +
                        (step === index ? "bg-[#1a3044] text-white" : "text-slate-500 hover:bg-slate-50")}>
                      <span className={"flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs " + (step === index ? "bg-white/20" : "bg-slate-100")}>{index + 1}</span>
                      {title}
                    </button>
                  )}
                </div>
                <p className="mt-5 border-t border-slate-100 px-2 pt-4 text-xs text-slate-500">Plano: <strong className="text-slate-800">{plan?.name ?? "Carregando..."}</strong></p>
              </div>
            </aside>

            <section className="min-w-0">
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-600">Passo {step + 1} de 4</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight">{STEPS[step]}</h1>
                <p className="mt-2 text-sm leading-7 text-slate-500">
                  {step === 0 ? "A identidade visual acompanha sua igreja nas telas. Ícone exclusivo segue a disponibilidade do plano."
                    : step === 1 ? "Ative apenas os departamentos existentes e diga quantas pessoas atuam em cada um."
                    : step === 2 ? "Defina seu alcance ministerial e os cargos usados pela igreja."
                    : "Seu painel já pode refletir a estrutura escolhida. Gere um aplicativo exclusivo se seu plano permitir."}
                </p>
              </div>

              {step === 0 ? (
                <div className={cardClass + " grid gap-5"}>
                  <label className="text-xs font-bold">Nome da igreja<input className={inputClass + " mt-2"} value={churchName} onChange={e => setChurchName(e.target.value)} maxLength={120} /></label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold">Logo da igreja
                      <input className={inputClass + " mt-2"} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setLogoFile(e.target.files?.[0] ?? null)} />
                    </label>
                    <label className="text-xs font-bold">Nome no celular {canAppName ? "" : "• plano White Label / Rede"}
                      <input disabled={!canAppName} className={inputClass + " mt-2 disabled:bg-slate-100"} value={canAppName ? appName : churchName} onChange={e => setAppName(e.target.value)} maxLength={40} />
                    </label>
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-bold">Cor principal {canColors ? "" : "• acompanhe a identidade Elo no seu plano"}</p>
                    <div className="flex flex-wrap gap-2">{COLORS.map(c =>
                      <button disabled={!canColors} title={c} key={c} className={"h-9 w-9 rounded-xl border-2 disabled:opacity-35 " + (primary === c ? "border-slate-900" : "border-white")} style={{ backgroundColor: c }} onClick={() => setPrimary(c)} />
                    )}</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {([{ label: "Principal", value: primary, set: setPrimary }, { label: "Secundária", value: secondary, set: setSecondary }, { label: "Fundo", value: background, set: setBackground }]).map(field =>
                      <label className="text-xs font-bold" key={field.label}>{field.label}
                        <input disabled={!canColors} className={inputClass + " mt-2 disabled:bg-slate-100"} value={field.value} maxLength={7} onChange={e => field.set(e.target.value)} />
                      </label>)}
                  </div>
                  {(canIcon || canSplash) ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {canIcon && <label className="text-xs font-bold">Ícone exclusivo (opcional)<input className={inputClass + " mt-2"} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setIconFile(e.target.files?.[0] ?? null)} /></label>}
                      {canSplash && <label className="text-xs font-bold">Imagem de abertura (opcional)<input className={inputClass + " mt-2"} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setSplashFile(e.target.files?.[0] ?? null)} /></label>}
                    </div>
                  ) : null}
                  <button className={primaryButton + " w-fit"} disabled={busy} onClick={() => void saveBrand()}>{busy ? "Salvando..." : "Salvar identidade e continuar →"}</button>
                </div>
              ) : null}

              {step === 1 ? (
                <div className="grid gap-4">
                  <div className={cardClass}>
                    <label className="text-xs font-bold">Quantos membros a igreja possui?
                      <input className={inputClass + " mt-2"} inputMode="numeric" value={estimatedMembers} onChange={e => setEstimatedMembers(e.target.value.replace(/\D/g, ""))} placeholder="Ex.: 120 • opcional" />
                    </label>
                    <p className="mt-2 text-xs text-slate-500">Somente planejamento, não cria membros fictícios.</p>
                  </div>
                  <div className={cardClass}>
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                      <div><h3 className="text-lg font-extrabold">Departamentos da igreja</h3><p className="mt-1 text-xs text-slate-500">{activeDepts.length} selecionados</p></div>
                      <input aria-label="Buscar departamento" className={inputClass + " w-full sm:w-52"} value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." />
                    </div>
                    {Array.from(new Set(departments.map(d => d.category))).map(category => {
                      const items = departments.filter(d => d.category === category && d.name.toLowerCase().includes(search.toLowerCase().trim()));
                      if (!items.length) return null;
                      return <div key={category} className="mb-6">
                        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-sky-700">{category}</p>
                        <div className="grid gap-2">{items.map(d => {
                          const selected = chosenDepartments[d.key] !== undefined;
                          return <div key={d.key} className={"rounded-2xl border p-3 " + (selected ? "border-sky-300 bg-sky-50/60" : "border-slate-200")}>
                            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
                              <input type="checkbox" checked={selected} onChange={() => toggleDepartment(d.key)} className="h-5 w-5 accent-sky-700" />
                              <span className="flex-1">{d.name}</span>
                              <span className="text-[11px] text-slate-400">{d.functions.length} funções</span>
                            </label>
                            {selected && <div className="mt-3 flex items-center justify-between gap-3 border-t border-sky-100 pt-3 text-xs text-slate-600">
                              Pessoas na equipe (estimativa)
                              <input aria-label={"Pessoas em " + d.name} className="w-20 rounded-xl border border-slate-200 bg-white p-2 text-center text-sm font-bold" inputMode="numeric" value={chosenDepartments[d.key]} onChange={e => setChosenDepartments(v => ({ ...v, [d.key]: e.target.value.replace(/\D/g, "") }))} />
                            </div>}
                          </div>;
                        })}</div>
                      </div>;
                    })}
                    <div className="mt-4 flex gap-2">
                      <input aria-label="Novo departamento" className={inputClass} value={customDepartmentName} onChange={e => setCustomDepartmentName(e.target.value)} placeholder="Outro departamento..." maxLength={80} />
                      <button className={secondaryButton} onClick={addCustomDepartment}>Adicionar</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button className={secondaryButton} onClick={() => setStep(0)}>← Voltar</button>
                    <button className={primaryButton} onClick={() => { setStep(2); show(""); }}>Continuar para ministérios →</button>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="grid gap-4">
                  <div className={cardClass}>
                    <h3 className="mb-4 text-lg font-extrabold">Qual é seu escopo ministerial?</h3>
                    <div className="grid gap-3 sm:grid-cols-2">{SCOPES.map(s =>
                      <button key={s.key} onClick={() => setMinistryScope(s.key)}
                        className={"rounded-2xl border p-4 text-left " + (ministryScope === s.key ? "border-sky-400 bg-sky-50" : "border-slate-200")}>
                        <p className="text-sm font-bold">{ministryScope === s.key ? "◉ " : "○ "}{s.title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{s.description}</p>
                      </button>
                    )}</div>
                  </div>
                  <div className={cardClass}>
                    <h3 className="text-lg font-extrabold">Cargos ministeriais</h3>
                    <p className="mb-5 mt-1 text-xs leading-6 text-slate-500">Somente nomenclatura. Esses títulos não concedem acesso ao financeiro ou à administração.</p>
                    <div className="grid gap-2 sm:grid-cols-2">{[...MINISTRY_PRESETS, ...customMinistries].map(m =>
                      <label key={m.key} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-semibold">
                        <input type="checkbox" className="h-5 w-5 accent-sky-700"
                          checked={Boolean(chosenMinistries[m.key])}
                          onChange={() => setChosenMinistries(current => {
                            const next = { ...current }; if (next[m.key]) delete next[m.key]; else next[m.key] = m; return next;
                          })} />
                        {m.name}
                      </label>
                    )}</div>
                    <div className="mt-4 flex gap-2">
                      <input className={inputClass} value={newMinistryName} maxLength={80} placeholder="Outro cargo..." onChange={e => setNewMinistryName(e.target.value)} />
                      <button className={secondaryButton} onClick={addMinistry}>Adicionar</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button className={secondaryButton} onClick={() => setStep(1)}>← Voltar</button>
                    <button className={primaryButton} disabled={busy} onClick={() => void saveStructure()}>{busy ? "Salvando estrutura..." : "Salvar estrutura →"}</button>
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="grid gap-4">
                  <section className={cardClass}>
                    <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">✓ Personalização concluída</span>
                    <h3 className="mt-4 text-2xl font-black">Tudo pronto para sua igreja.</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-500">Foram escolhidos {activeDepts.length} departamentos e {Object.keys(chosenMinistries).length} cargos ministeriais. O motor de escalas usa essas equipes para configurar cada culto.</p>
                  </section>
                  <section className={cardClass}>
                    <h3 className="text-xl font-black">Aplicativo exclusivo da igreja</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-500">Ícone e nome próprios no celular, estrutura carregada ao entrar e identidade da igreja em todo o painel.</p>
                    <div className="my-5 grid gap-2 text-sm">
                      <div className="flex justify-between"><span>APK próprio</span><b>{canApk ? "Disponível" : "Elo Rede / White Label"}</b></div>
                      <div className="flex justify-between"><span>Push com identidade da igreja</span><b>{brandedPush ? "Incluído no plano*" : "Não incluído"}</b></div>
                    </div>
                    <button disabled={!canApk || busy} className={primaryButton + " w-full"} onClick={() => void requestApk()}>
                      {busy ? "Solicitando..." : canApk ? "Solicitar meu APK personalizado" : "APK exclusivo indisponível neste plano"}
                    </button>
                    <p className="mt-3 text-xs leading-5 text-slate-500">*Para push Android funcionar, o aplicativo exige credenciais FCM específicas e permissão do usuário. O ícone de push é incorporado na compilação.</p>
                    {!canApk && <p className="mt-3 text-sm text-sky-800">A identidade e estrutura continuam funcionando no aplicativo Elo compartilhado, conforme os recursos do plano.</p>}
                  </section>
                  <section className={cardClass}>
                    <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-extrabold">Minhas compilações</h3><button className="text-xs font-bold text-sky-700" onClick={() => void loadBuilds(church.id)}>Atualizar</button></div>
                    {builds.length === 0 ? <p className="mt-4 text-sm text-slate-500">Nenhuma compilação solicitada.</p> : <div className="mt-4 grid gap-3">{builds.map(b =>
                      <div key={b.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div><p className="font-bold">{b.status === "queued" ? "Solicitação recebida" : b.status === "building" ? "Gerando APK..." : b.status === "ready" ? "Aplicativo pronto" : "Falha na compilação"}</p>
                            <p className="mt-1 text-xs text-slate-500">{new Date(b.created_at).toLocaleString("pt-BR")} • {b.android_package}</p></div>
                          {b.status === "ready" && <button className={primaryButton} onClick={() => void downloadApk(b)}>Baixar APK ↓</button>}
                        </div>
                        {b.failure_reason && <p className="mt-2 text-xs text-red-700">{b.failure_reason}</p>}
                      </div>
                    )}</div>}
                  </section>
                </div>
              ) : null}
            </section>

            <aside className="h-fit lg:sticky lg:top-6">
              <div className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-4 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Prévia ao vivo</p>
                <div className="overflow-hidden rounded-[1.8rem] border-[6px] border-slate-900 shadow-lg" style={{ background: canColors ? background : defaultBrand.background }}>
                  <div className="p-5" style={{ background: canColors ? primary : defaultBrand.primary }}>
                    <div className="flex items-center gap-2">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white text-xl font-black text-sky-600">
                        {previewLogo ? <img src={previewLogo} alt="Logo da igreja" className="h-full w-full object-contain" /> : "E"}
                      </div>
                      <div className="min-w-0"><p className="truncate text-sm font-black text-white">{churchName || church.name}</p><p className="text-[11px] text-white/80">Meu Elo • Comunidade</p></div>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-extrabold">Olá, bem-vindo!</h3>
                    <p className="mt-1 text-xs text-slate-500">Acompanhe sua igreja.</p>
                    <div className="mt-5 grid gap-2 text-sm">
                      {["Próximo culto", "Minhas escalas", ...(showKids ? ["Elo Kids"] : []), ...activeDepts.slice(0, 3).map(d => d.name)].map(title =>
                        <div key={title} className="flex items-center justify-between rounded-xl bg-white p-3 text-xs font-bold shadow-sm">{title}<span className="text-sky-600">›</span></div>)}
                      {!activeDepts.length && <div className="rounded-xl bg-white p-4 text-xs text-slate-500">Escolha seus departamentos para montar os atalhos.</div>}
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-500">Prévia ilustrativa: cores e módulos são aplicados no aplicativo conforme a configuração e as permissões.</p>
                {joinCode && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs">Código da igreja: <b>{joinCode}</b></p>}
              </div>
            </aside>
          </div>
        ) : null}

        {message && <div role="status" className="mx-auto mt-5 max-w-5xl rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div>}
        {error && <div role="alert" className="mx-auto mt-5 max-w-5xl rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      </div>
    </main>
  );
}
