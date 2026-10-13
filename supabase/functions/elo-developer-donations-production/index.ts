// Nethanel Elo — endpoint SEPARADO para preparação de ofertas REAIS.
// ESTADO INTENCIONAL: BLOQUEADO. Nunca criar QR, checkout ou débito aqui.
// A autorização atual é somente instalar infraestrutura desativada.
// A habilitação futura exige análise do código, SQL específico e aprovação expressa.
export const LIVE_DONATIONS_IMPLEMENTED = false as const;

const json = (status: number, code: string, message: string) =>
  new Response(JSON.stringify({
    ok: false, code, message,
    environment: "production",
    paymentsEnabled: false,
    requiresNewAuthorization: true,
  }), {
    status, headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

Deno.serve((request: Request) => {
  if (request.method !== "POST") {
    return json(405, "method_not_allowed", "Método não permitido.");
  }
  // Nem uma variável ativada por engano permite pagamentos.
  // Somente uma FUTURA revisão de código autorizada poderá remover este bloqueio.
  if (Deno.env.get("ELO_DONATIONS_PRODUCTION_ENABLED") === "true") {
    console.warn("Elo production gate remains locked: authorization for activation is pending.");
  }
  return json(
    503, "production_donations_disabled",
    "As ofertas reais estão em preparação e permanecem desativadas.",
  );
});
