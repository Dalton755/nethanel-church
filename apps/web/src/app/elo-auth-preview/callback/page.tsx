"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {createEloStagingClient} from "../../../lib/elo-staging-invitations";
export default function EloAuthCallbackPreview(){
 const router=useRouter();const [message,setMessage]=useState("Confirmando seu login...");
 useEffect(()=>{let active=true;(async()=>{
 const client=createEloStagingClient();
 if(!client){if(active)setMessage("Ambiente de homologação não configurado.");return}
 const url=new URL(window.location.href);
 const authError=url.searchParams.get("error_description")||url.searchParams.get("error");
 if(authError){if(active)setMessage("Login não concluído: "+authError);return}
 const code=url.searchParams.get("code");
 try{
  if(code){const {error}=await client.auth.exchangeCodeForSession(code);if(error)throw error}
  const {data,error}=await client.auth.getUser();
  if(error||!data.user)throw new Error("Não foi possível confirmar a sessão Google.");
  if(active)router.replace("/meus-convites-preview");
 }catch(e){if(active)setMessage(e instanceof Error?e.message:"Falha na autenticação.")}
 })();return()=>{active=false}},[router]);
 return <main className="flex min-h-screen items-center justify-center bg-[#f6f4ef] p-6 text-[#241d13]"><div className="max-w-md rounded-3xl bg-white p-7 text-center shadow"><h1 className="text-xl font-bold">Acesso ao Elo</h1><p role="status" className="mt-4 text-sm">{message}</p><Link href="/elo-login-preview" className="mt-6 inline-block text-sm font-semibold text-[#8c652a]">Voltar ao login</Link></div></main>
}