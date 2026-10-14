// Validação pura de eventos de Pix REAL. Não possui rede nem acesso ao banco.
// Motor ainda NÃO carregado pelo endpoint público desativado.
export type RealPixEvent = {
  cycleId: string;
  qrId: string;
  eventId: string;
  paymentId: string;
  eventType: string;
  state: "pending"|"paid"|"refunded"|"canceled";
  amountCents: number;
};

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId=(x:unknown)=>typeof x==="string"&&x.length>=5&&x.length<=150&&
  /^[a-zA-Z0-9._:-]+$/.test(x);
const eventStates: Record<string,RealPixEvent["state"]> = {
  PAYMENT_CREATED:"pending",
  PAYMENT_UPDATED:"pending",
  PAYMENT_RECEIVED:"paid",
  PAYMENT_CONFIRMED:"paid",
  PAYMENT_REFUNDED:"refunded",
  PAYMENT_DELETED:"canceled",
};

export function parseRealPixEvent(payload:unknown):RealPixEvent|null {
  if(!payload || typeof payload!=="object" || Array.isArray(payload)) return null;
  const root=payload as Record<string,unknown>;
  if(typeof root.event!=="string" || !Object.hasOwn(eventStates,root.event)) return null;
  const payment=root.payment;
  if(!payment || typeof payment!=="object" || Array.isArray(payment)) return null;
  const p=payment as Record<string,unknown>;
  if(!safeId(root.id) || !safeId(p.id) || !safeId(p.pixQrCodeId)) return null;
  const reference=typeof p.externalReference==="string" ? p.externalReference : "";
  const match=/^elo-prod:([0-9a-f-]{36})$/i.exec(reference);
  if(!match || !uuid.test(match[1])) return null;
  const amount=Number(p.value);
  const cents=Math.round(amount*100);
  if(!Number.isFinite(amount)||!Number.isSafeInteger(cents)||
     Math.abs(cents/100-amount)>0.000001||cents<500||cents>5_000_000)
    return null;
  return {
    cycleId:match[1],qrId:p.pixQrCodeId as string,
    eventId:root.id as string,paymentId:p.id as string,
    eventType:root.event,state:eventStates[root.event],
    amountCents:cents,
  };
}
