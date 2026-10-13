# Elo — Asaas PRODUÇÃO: endpoints pré-instalados, cobranças DESATIVADAS

**Estado em 13/10/2026:** autorização expressa somente para preparar infraestrutura REAL **inativa**.
A branch `feature/elo-updates-foundation` não foi mesclada nem publicada em Play Store, nenhum pagamento real foi iniciado.

## Isolamento funcional

| Item | Sandbox testado | Produção preparada/inativa |
|---|---|---|
| Função para contribuição | `elo-developer-donations` | `elo-developer-donations-production` |
| Webhook Asaas | `elo-asaas-sandbox-webhook` | `elo-asaas-production-webhook` |
| Ambiente Asaas | `https://api-sandbox.asaas.com/v3` | **Sem API externa conectada nesta etapa** |
| Segredos | `ELO_ASAAS_SANDBOX_API_KEY`, `ELO_ASAAS_SANDBOX_WEBHOOK_TOKEN` | **Não criados neste estágio** |
| Chave Pix / movimentação | Saldo fictício | **Nenhuma consulta, QR ou cobrança real** |
| App atual | Referência exclusiva ao fluxo de teste | **Não conectado aos endpoints novos** |
| JWT contribuição | Exigido | Exigido (`verify_jwt=true`) |
| JWT webhook | Desligado (authToken próprio) | Desligado (`verify_jwt=false`; valida token próprio quando configurado) |

**Os dois novos endpoints respondem bloqueados com HTTP 503**, mesmo se `ELO_DONATIONS_PRODUCTION_ENABLED=true` for configurada por erro: há bloqueio no próprio código e não há nenhuma chamada à API financeira ou ao banco. Não ativar flag. A futura habilitação exige outra alteração de código revisada e aprovada pelo responsável.

## URLs destinadas à futura integração (NÃO registrar no Asaas ainda)

- Oferta: `https://esukjhuyooppxgfmltkb.supabase.co/functions/v1/elo-developer-donations-production`
- Webhook: `https://esukjhuyooppxgfmltkb.supabase.co/functions/v1/elo-asaas-production-webhook`

Não criar/configurar Webhook no Asaas real apontando ao endereço acima enquanto a função estiver bloqueada; resposta HTTP 503 faria o Asaas tentar novamente e eventualmente pausar a fila. O Asaas recomenda **HTTP 200 após persistência rápida** e idempotência baseada no ID do evento.

## Nomes reservados para configuração SEGURA futura

Não compartilhar qualquer chave no chat, repositório, app, SQL, logs ou código.
Quando for autorizada a integração operacional, configurar diretamente no **Supabase > Edge Functions > Secrets**:
- `ELO_ASAAS_PRODUCTION_API_KEY`: chave da conta Asaas de produção, diferente de Sandbox.
- `ELO_ASAAS_PRODUCTION_WEBHOOK_TOKEN`: token aleatório de 32 a 255 caracteres, gerado para um Webhook Asaas real separado, não reutilizar API Key.
- `ELO_DONATIONS_PRODUCTION_ENABLED`: manter ausente ou **`false`** até a autorização explícita de ativação.

Chave Pix real e sua titularidade devem ser verificadas diretamente no painel Asaas, sem armazenar chave no app.

## Próximas etapas, cada uma sujeita a aprovação explícita

1. Implementar no novo backend um modelo **production-only** para contribuições reais que preserve RLS e RBAC por organização e registre eventos isolados das assinaturas comerciais antigas. Testar com fixtures e concorrência.
2. Implementar webhook real: validar `asaas-access-token`, idempotência, valor/tenant/QR/ciclo, fila de eventos, reconciliação e estorno, sem coletar dados desnecessários.
3. Revisar aspectos legais e UX: apoio espontâneo ao desenvolvedor, não é dízimo/oferta para a igreja; sem vantagem nem cobrança obrigatória; comprovante e política de privacidade.
4. Acompanhamento de status/validação do Asaas de produção e liberação de chave Pix. Cadastrar segredos **somente via painel seguro**.
5. Com aprovação específica, realizar primeiro pagamento real de pequeno valor em organização escolhida e conferir extrato/webhook.
6. Com nova aprovação, disponibilizar a produção a outras igrejas.

## Verificação técnica automática

Workflow: `.github/workflows/elo-production-payments-lock.yml`; teste Python em `scripts/elo_production_payments_lock_check.py` (sem acesso ao Asaas ou Supabase).
O teste prova que os novos endpoints não possuem `fetch`, persistência SQL e **nem** código para emitir pagamentos, permanecendo em fail-closed.

## Referências Asaas (consultadas em 13/10/2026)

- https://docs.asaas.com/reference/criar-qrcode-estatico
- https://docs.asaas.com/docs/criar-novo-webhook-pela-api
- https://docs.asaas.com/docs/sobre-os-webhooks
- https://docs.asaas.com/docs/faq-de-webhooks
