# Elo — auditoria pré-produção das ofertas voluntárias

**Data:** 13/10/2026. **Estado:** PREPARAÇÃO, **SEM AUTORIZAÇÃO DE PAGAMENTOS REAIS**.
**Branch:** `feature/elo-updates-foundation`. Não aplicar merge em `main`, não criar webhook ou chave de produção, não publicar APK nem habilitar cobrança real nesta fase.

## Escopo

Ofertas únicas e ofertas mensais Pix **manuais** ao desenvolvedor (acesso aos perfis owner/admin/pastor/tesoureiro). A oferta não tem qualquer efeito sobre permissões/planos da igreja. O QR Code é apresentado diretamente no aplicativo com Pix Copia e Cola. Somente a Elo Church Demo (`101212c5-6e81-4915-ae9a-fbde5b42bb04`) opera em Sandbox, com dinheiro fictício.

## Verificações concluídas

1. O fluxo de Pix único foi gerado, pago e conciliado por webhook no Asaas Sandbox.
2. O fluxo Pix mensal manual foi gerado, pago, reconheceu a competência de outubro, rejeitou novo QR para competência já paga e cancelou a contribuição sem apagar o pagamento confirmado.
3. Tabelas `elo_developer_donations` e `elo_developer_monthly_pix_cycles` têm RLS ativo; os registros são consultados via RPC/Edge Function após validação de conta e perfil. Cliente/anon não têm acesso direto à tabela de ciclos.
4. Nenhuma função do fluxo Demo aponta para `https://api.asaas.com/v3` ou usa chave real; a variável de API para Pix Demo continua `ELO_ASAAS_SANDBOX_API_KEY`.
5. O webhook Sandbox exige token exclusivo `asaas-access-token`; as regras dos eventos conferem vínculo, valor, ambiente e identificador e registram um evento só uma vez.
6. A auditoria automática `python3 scripts/elo_donations_safety_gate.py` na branch de teste verifica isolamento, chaves, validação de acesso, idempotência e ausência de alterações de assinatura pela oferta. CI `.github/workflows/elo-donations-safety-gate.yml` não realiza deploy.
7. **Verificação read-only do banco:** 5 igrejas; 1 Pix único confirmado e 1 Pix mensal de outubro confirmado com compromisso já cancelado; existem 2 Pix únicos pendentes do Sandbox. Os lançamentos de oferta permanecem no ambiente `sandbox`.

## BLOQUEADORES antes de ofertar em produção

**1 — Acesso gratuito (concluído em 13/10/2026):** migração `20261013182943_elo_free_access_preserve_legacy_billing_v65.sql` APLICADA no Supabase. Todas as 5 igrejas têm plano efetivo `ELO_REDE` gratuito e acesso à personalização, independentemente do plano histórico. Foram bloqueadas as RPCs de novos checkouts e novas faturas comerciais; lista pública de planos pagos vazia; trigger de teste inicial desativado. Não foi alterada a situação histórica dos registros financeiros. Os rascunhos antigos de migrations foram arquivados em `supabase/drafts/` para evitar reaplicação acidental.

**2 — Financeiro legado (pendente de baixa no provedor):** a migração gratuita manteve intactos os dados abaixo e NÃO cancelou nem perdoou cobranças previamente criadas. Não alterar nem apagar as tabelas `organization_subscriptions`, `billing_invoices`, `billing_payment_attempts` ou `billing_recurring_authorizations` nesta tarefa. Auditoria agregada mostrou:
- `organization_subscriptions`: 5 registros (2 ativos, 2 pendentes e 1 expirado; nenhum com ID de assinatura externo).
- `billing_invoices`: 1 fatura **em atraso** no ambiente de produção, e 5 lançamentos no Sandbox.
- `billing_payment_attempts`: existem tentativas de cobrança Asaas em produção, incluindo 1 pendente de confirmação com status `created` e 1 `overdue`.
- `billing_recurring_authorizations`: 1 autorização Asaas produção `refused`, sem ID de assinatura ativo; outras duas são Sandbox (cancelada/recusada).
Esses dados precisam de revisão antes de proclamar desativação do faturamento comercial. Isso **não implica** existência de débito real pagável nem confirma ausência de compromisso fora do banco. Verificação read-only após migração confirmou **5 registros de assinatura, 6 faturas, 11 tentativas de pagamento e 3 autorizações recorrentes**, todos preservados.

**3 — Isolamento de produção:** implementar **novas** Edge Functions, URL/token de webhook e configuração de chaves **exclusivas de produção**. Não reaproveitar nem transformar as funções `elo-developer-donations` e `elo-asaas-sandbox-webhook` em endpoint de produção apenas alterando a URL. Manter flag de habilitação de produção desativada por padrão, com allowlist interna no primeiro teste. Nenhuma chave real no GitHub, app, SQL ou logs.

**4 — Webhook:** validar o `authToken` de 32–255 caracteres; processar e persistir eventos com idempotência, controle de retries/fila pausada, estratégia para conciliação de webhook perdido e observabilidade sem CPF/chave. O Asaas recomenda resposta 2xx após persistência rápida e entrega `at least once`. Especificar eventos apenas necessários e rejeitar referência/valor/QR divergentes.

**5 — Compliance e reconciliação:** conferir dados da conta que recebe as ofertas, tarifas Pix, exibição clara de quem recebe, voluntariedade, identificação da natureza da contribuição, LGPD, política de privacidade, tratamento de estorno, suporte e comprovantes. Confrontar extratos/saldo Asaas com os recebimentos antes de abrir a função ao público.

**6 — Aplicativo e UX:** diferenciar Sandbox de Produção com clareza; mostrar que Pix mensal é escolha **manual** (não Pix Automático nem débito automático); cancelamento deve impedir novos QRs; após pagamento, status deve ser confirmado apenas pelo servidor. Conferir comportamento sem internet e renovação em meses posteriores.

**7 — Testes externos:** conta Asaas produção validada + chave Pix ativa + IP/regras de segurança + webhook com token exclusivo. Antes do primeiro pagamento real, executar bateria de QA de sandbox: geração, duas chamadas simultâneas, cópia, pagamento, duplicidade de webhook, estorno, pagamento após cancelamento, Pix expirado, usuário sem permissão, troca de igreja e conexão instável. **Nenhum teste em produção sem uma aprovação posterior específica.**

## Próxima aprovação necessária

Solicitar autorização separada para cada etapa: 
(a) tratar plano gratuito/billing legado de modo seguro;
(b) criar infraestrutura/configuração isolada e inativa de pagamentos reais;
(c) ativar pagamento real com valor e organização de teste definidos;
(d) disponibilizar para todas as igrejas. 
A aprovação para preparar auditoria **não** concede (b), (c) ou (d).

## Referências externas (oficiais)

- https://docs.asaas.com/docs/criar-novo-webhook-pela-api
- https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook
- https://docs.asaas.com/changelog/obrigatoriedade-e-auto-gera%C3%A7%C3%A3o-de-tokens-para-webhooks


## Resultado da liberação de acesso gratuito — 13/10/2026

- SQL de acesso completo aplicado com segurança; nenhuma cobrança real nova foi gerada por esta etapa.
- `get_organization_plan_context`: `ELO_REDE`, preço zero, sem limites e sem expiração de acesso.
- `organization_effective_plan_code` e `organization_people_limit`: recursos completos e limite ilimitado.
- 5/5 igrejas: `white_label_enabled=true`; novas igrejas também têm esse padrão.
- Trigger de criação de plano de teste `zz_organizations_start_elo_complete_trial` DESATIVADO; demais gatilhos essenciais de inicialização permanecem ativos.
- RPCs para criar checkout comercial e faturas bloqueadas, inclusive para APKs antigos que as invoquem; histórico e webhooks antigos não foram excluídos.
- Uma fatura antiga classificada como **overdue** no banco de produção (R$ 49,90) permanece em aberto no histórico. É necessário conciliar o estado do boleto/Pix antigo diretamente no Asaas antes de cancelar ou encerrar a cobrança externa. Não afirmar que não há meios de pagamento históricos ainda válidos.
- Migração efetiva foi registrada pelo Supabase como versão `20261013182943`; arquivos de rascunho anteriores foram movidos para `supabase/drafts/` por segurança.
