# Elo — Asaas PRODUÇÃO: endpoints pré-instalados, cobranças DESATIVADAS

**Estado em 13/10/2026:** autorização expressa somente para preparar infraestrutura REAL **inativa**. **Implantação confirmada no Supabase:** `elo-developer-donations-production` v1 (`verify_jwt=true`) e `elo-asaas-production-webhook` v1 (`verify_jwt=false`), ambas com comportamento fail-closed `503`. O Asaas de produção NÃO foi conectado e as credenciais reais ainda NÃO foram configuradas. O CI de bloqueio teve sucesso na execução `38466726474`.
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

## Validação read-only de chave de produção — 13/10/2026

O usuário confirmou que a chave `ELO_ASAAS_PRODUCTION_API_KEY` foi criada e salva no Supabase. **Não tivemos acesso nem expusemos o valor da chave.**
O endpoint **`elo-asaas-production-health` v1** foi instalado como função **`verify_jwt=true`**, separado dos endpoints financeiros desativados.
Somente um **administrador global ativo**, verificado pelo Supabase Auth e pela tabela `platform_admins`, pode utilizá-lo.
O diagnóstico realiza exclusivamente o **GET de leitura** `https://api.asaas.com/v3/pix/addressKeys?status=ACTIVE&limit=20` (Asaas Produção) com a chave obtida no servidor. O retorno ao aplicativo contém somente indicadores de conexão e existência de pelo menos uma chave Pix ativa, **nunca conteúdo da chave, dados da conta, QR/payload ou saldo**. Uso limitado a uma verificação por 30 segundos na instância. Nenhum cliente comum pode acionar esse recurso.

No painel `Painel Nethanel` do app de prévia, foi adicionado o botão **Verificar conexão Asaas**, com mensagens específicas para credencial ausente, inválida, acesso restrito e conexão estabelecida. Ainda é necessário executar o teste a partir de uma sessão do administrador global.
CI `38499386340` concluiu com sucesso (segurança da integração + Deno + TypeScript React Native). Build privado em GitHub Actions `38499488257`, aguardando compilação.
Nenhum QR real foi emitido e nenhuma operação financeira de produção foi ativada; `elo-developer-donations-production` e `elo-asaas-production-webhook` permanecem BLOQUEADOS por código.

**Importante**: a consulta Pix é só diagnóstico de autenticação/permissão; não autoriza emitir uma cobrança e não prova, isoladamente, que todos os recursos da conta estão aptos para uso.

## Validação visual de conexão — 13/10/2026

O responsável executou o botão **Verificar conexão Asaas** dentro do **Painel Nethanel** em APK privado e enviou captura de tela com o resultado: **“Conexão Asaas PRODUÇÃO validada! Chave Pix ativa localizada. Nenhuma cobrança foi criada.”** Esta é a resposta do endpoint somente leitura `elo-asaas-production-health`, e confirma a verificação de credencial/chave Pix. **Não é teste de recebimento real**, nem autoriza ativar emissão de cobranças ou webhook financeiro. Os endpoints de pagamento e conciliação permanecem intencionalmente bloqueados (HTTP 503) e o aplicativo continua sem acesso aos valores de Secrets.
