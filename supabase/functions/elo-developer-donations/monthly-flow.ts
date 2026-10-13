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
    const {data:saved,error:saveError}=await admin.rpc("elo_commit_monthly_pix_qr",{
      p_cycle_id:cycleId,p_donation_id:donationId,p_provider_qr_id:pix.id,
      p_pix_payload:pix.payload,p_expires_at:pix.expiresAt,
    });
    if(saveError || saved !== true) {
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
  user: any, apiKey: string, donation: any,
) {
  if(donation.organization_id!==sandboxDemoOrg || donation.environment!=="sandbox" ||
     donation.frequency!=="monthly" || donation.payment_method!=="pix" ||
     donation.checkout_url) {
    return {ok:false,message:"Esta oferta não utiliza Pix mensal manual."};
  }
  // O banco trava a mesma linha que a gravação do QR. Assim, nenhum
  // Pix novo pode nascer depois do cancelamento, mesmo com cliques simultâneos.
  const {data:closed,error}=await user.rpc("cancel_elo_monthly_pix_pledge",{
    p_donation_id:donation.id,
  });
  if(error || !closed?.canceled) {
    return {ok:false,message:error?.message ??
      "Não foi possível cancelar a contribuição mensal."};
  }
  let unrevoked=0;
  const qrIds=Array.isArray(closed.qrIds) ? closed.qrIds : [];
  for(const code of qrIds) {
    if(typeof code==="string" && !await tryDisableSandboxPix(apiKey,code))
      unrevoked++;
  }
  return {
    ok:true,canceled:true,alreadyCanceled:Boolean(closed.alreadyCanceled),
    warning:unrevoked ?
      "A oferta foi cancelada e não haverá novos QR Codes mensais. Um Pix já emitido poderá permanecer válido até expirar." :
      null,
  };
}
