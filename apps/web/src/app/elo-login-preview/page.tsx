"use client";
import {useState} from "react";
import Link from "next/link";
import {createEloStagingClient} from "../../lib/elo-staging-invitations";
export default function EloGoogleLoginPreview(){
 const [client]=useState(()=>createEloStagingClient());const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 async function login(){
  if(!client){setError("Conexão de homologação indisponível.");return}
  setBusy(true);setError("");
  const callback=window.location.origin+"/elo-auth-preview/callback";
  const {error:e}=await client.auth.signInWithOAuth({provider:"google",options:{redirectTo:callback,queryParams:{prompt:"select_account"}}});
  if(e){setError(e.message);setBusy(false)}
 }
 return <main className="flex min-h-screen items-center justify-center bg-[#f6f4ef] px-4"><div className="w-full max-w-md rounded-3xl border border-[#e6dac8] bg-white p-7 text-[#211a12] shadow-lg"><Link href="/meus-convites-preview" className="text-sm text-[#89642c]">← Meus convites</Link><h1 className="mt-7 text-3xl font-bold">Entrar no Elo</h1><p className="mt-3 text-sm text-slate-600">Entre com sua conta Google para acessar seus convites na homologação.</p><button disabled={busy||!client} onClick={login} className="mt-7 w-full rounded-2xl bg-[#80602d] px-5 py-4 font-bold text-white disabled:opacity-50">{busy?"Redirecionando...":"Continuar com Google"}</button>{error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<p className="mt-5 text-xs text-slate-500">Ambiente isolado de testes. Nenhum login concede permissões administrativas automaticamente.</p></div></main>
}