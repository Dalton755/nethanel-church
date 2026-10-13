import { createSandboxManualPix, tryDisableSandboxPix, sandboxDemoOrg } from "./manual-pix.ts";

// O banco cria/reserva um único período por mês e por oferta, com trava.
export async function getOrCreateMonthlyPix(
  user: any, admin: any, apiKey: string, donationId: string,
) {
  const {data:reservation,error}=await user.rpc("reserve_elo_monthly_pix_cycle",{
    p_donation_id:donationId,
  });
  if(error || !reservation?.state)
    throw new Error(error?.message ?? "Não foi possível preparar o Pix do mês.");
  const state=String(reservation.state);
  if(state==="canceled") return {
    ok:false,message:"Esta oferta mensal foi cancelada. Nenhum Pix novo será gerado.",
  };
  if(state==="paid") return {
    ok:true,alreadyPaid:true,id:donationId,cycleId:reservation.cycleId,
    month:reservation.month,amountCents:reservation.amountCents,sandbox:true,
  };
  if(state==="pending"){
    return {
      ok:true,id:donationId,cycleId:reservation.cycleId,
      month:reservation.month,amountCents:reservation.amountCents,
      pixPayload:reservation.pixPayload,expiresAt:reservation.expiresAt,
      reused:true,sandbox:true,
    };
  }
  if(state==="processing") return {
    ok:false,message:"O Pix deste mês já está sendo preparado. Aguarde alguns instantes.",
  };
  if(state!=="new" || typeof reservation.cycleId!=="string" ||
      !Number.isInteger(Number(reservation.amountCents)) ||
      typeof reservation.month!=="string") {
    throw new Error("Período mensal inválido.");
  }
  const cycleId=String(reservation.cycleId);
  let pix: Awaited<ReturnType<typeof createSandboxManualPix>> | null=null;
  try {
    pix=await createSandboxManualPix(apiKey,Number(reservation.amountCents),
      `elo-monthly:${cycleId}`,"Oferta voluntária mensal Nethanel Elo (Pix manual, teste)");
    const {data:saved,error:saveError}=await admin
      .from("elo_developer_monthly_pix_cycles").update({
        status:"pending",provider_qr_id:pix.id,pix_payload:pix.payload,
        pix_expires_at:pix.expiresAt,updated_at:new Date().toISOString(),
      }).eq("id",cycleId).eq("donation_id",donationId).eq("status","processing")
      .select("id").maybeSingle();
    if(saveError || !saved) {
      await tryDisableSandboxPix(apiKey,pix.id);
      throw new Error("Não foi possível registrar o Pix mensal.");
    }
    return {
      ok:true,id:donationId,cycleId,month:reservation.month,
      amountCents:reservation.amountCents,pixPayload:pix.payload,
      expiresAt:pix.expiresAt,sandbox:true,
    };
  }catch(error){
    await admin.from("elo_developer_monthly_pix_cycles").update({
      status:"failed",updated_at:new Date().toISOString(),
    }).eq("id",cycleId).eq("status","processing");
    return {ok:false,message:error instanceof Error ? error.message :
      "Não foi possível gerar o Pix de teste."};
  }
}

export async function cancelMonthlyManualPix(
  admin: any, apiKey: string, donation: any,
) {
  if(donation.organization_id!==sandboxDemoOrg || donation.environment!=="sandbox" ||
     donation.frequency!=="monthly" || donation.payment_method!=="pix" ||
     donation.checkout_url) {
    return {ok:false,message:"Esta oferta não utiliza Pix mensal manual."};
  }
  const {data:active,error:listError}=await admin
    .from("elo_developer_monthly_pix_cycles").select("id,provider_qr_id")
    .eq("donation_id",donation.id).eq("status","pending");
  if(listError) return {ok:false,message:"Não foi possível consultar os Pix pendentes."};

  // Cancelar a escolha mensal impede novos códigos; um código já emitido
  // ainda pode ser liquidado até expirar se o provedor recusar a revogação.
  const failedQr: string[]=[];
  for(const cycle of active ?? []){
    if(cycle.provider_qr_id && !await tryDisableSandboxPix(apiKey,cycle.provider_qr_id))
      failedQr.push(String(cycle.id));
  }
  const {error:updateError}=await admin.from("elo_developer_donations")
    .update({status:"canceled",updated_at:new Date().toISOString()})
    .eq("id",donation.id).eq("organization_id",sandboxDemoOrg)
    .eq("frequency","monthly").eq("payment_method","pix");
  if(updateError) return {ok:false,message:"Não foi possível cancelar a oferta mensal."};
  if((active??[]).length>0){
    await admin.from("elo_developer_monthly_pix_cycles")
      .update({status:"canceled",updated_at:new Date().toISOString()})
      .eq("donation_id",donation.id).eq("status","pending");
  }
  return {
    ok:true,canceled:true,
    warning:failedQr.length ?
      "Cancelada. Um Pix emitido antes do cancelamento ainda pode ser pago até expirar." :
      null,
  };
}
