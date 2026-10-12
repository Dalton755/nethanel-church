# Nethanel Elo — gratuito para todas as igrejas e ofertas voluntárias

**Estado:** apenas na branch `feature/elo-updates-foundation`, aguardando aprovação para migração/deploy da integração financeira. Não gerar cobranças reais antes da aprovação.

## Acesso
- Não há mais planos comerciais nem requisitos de pagamento para continuar usando o Elo.
- Servidor devolve `ELO_REDE` como conjunto de recursos completo, nome `Nethanel Elo • Gratuito` e limites ilimitados.
- Todos os cadastros de igreja recebem personalização completa, incluindo ícone, splash e APK por igreja. Custos operacionais de gerar APKs continuam controlados pela plataforma, sem cobrança de uso.
- Checkout legado Asaas/Mercado Pago é bloqueado **após a aplicação da migração**. Históricos financeiros são preservados e webhooks/cancelamento legados não são removidos.
- Assinaturas previamente estabelecidas em provedores externos não podem ser canceladas por apenas esconder a UI. Identificar e encerrar tais recorrências separadamente antes da migração.

## Ofertar para o desenvolvedor
- Acesso no `Perfil` somente para perfis `owner`, `admin`, `pastor` ou `tesoureiro`. Backend valida o vínculo ativo e a atribuição ativa de função.
- A mensagem do app deixa claro: o Elo foi criado para ajudar as igrejas, recursos são gratuitos e a oferta é opcional para custos de banco/servidor/segurança. Contribuição não dá privilégios.
- Periodicidade avulsa `once` ou recorrente `monthly`. O campo mostra moeda brasileira. Valor entre R$ 5,00 e R$ 50.000,00, com validação no cliente e servidor.
- Método: Pix, Cartão de crédito ou Boleto. A geração de link é feita por **Asaas Payment Links** (`POST /paymentLinks`), com pagador informado somente na página externa do Asaas.
- Modal confirma expressamente recorrência mensal. Não há cobrança ao apenas tocar em um botão; precisa concluir na página externa do Asaas.
- Os links de pagamento são registrados em `elo_developer_donations`; eventos financeiros em tabela separada com idempotência, valor conferido e webhook `elo-developer-donations-webhook`.
- A reconciliação de pagamento **não altera** `organization_subscriptions` nem `get_organization_plan_context`.
- A API de cancelamento precisa identificar o ID da assinatura Asaas confirmado antes de permitir cancelamento. Desabilitar o link sozinho **não** cancela assinatura recorrente.
- O usuário pode acompanhar sua oferta e cancelar a recorrência em seu próprio Perfil quando o identificador da assinatura tiver sido recebido. Deve haver suporte para cancelamento manual em caso de webhook perdido.

## Fase segura / Configuração
1. Validar telas e copy via APK **de prévia do Elo principal**; backend financeiro ainda não está disponibilizado.
2. Validar migrations SQL e Deno/React Native com GitHub Actions, sem acesso de escrita ao banco de produção.
3. Configurar secrets `ASAAS_API_KEY`, `ASAAS_API_URL` **sandbox**, `ASAAS_DONATIONS_WEBHOOK_TOKEN` (diferente da senha de usuário), `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` apenas no servidor.
4. Implementar webhook de evento PAYMENT_* exclusivo com `asaas-access-token`. A rota deve permanecer `verify_jwt=false` no webhook e `verify_jwt=true` no endpoint de checkout (identidade de login conferida por `auth.getUser`). Registrar URL de webhook na conta Asaas e testar entrega.
5. Rodar ciclo de teste em sandbox: nova oferta, Pix avulso pago, cartão, boleto, recorrente, cancelamento mensal, duplicação/retry de webhook e recusa de usuário sem privilégio.
6. Após **aprovação explícita**, aplicar migrações e publicar as novas Edge Functions com `ELO_DONATIONS_LIVE_ENABLED=false`, validar em sandbox e só ativar produção em autorização posterior.
7. Auditar assinaturas comerciais preexistentes no MP/Asaas antes de desativar assinaturas externas; bloqueio de novos checkouts não extingue débitos existentes.

## Importante
- O Asaas permite links recorrentes ou únicos, cobrados com método escolhido; Pix mensal pode ser manual (sem débito automático), conforme possibilidade da modalidade no provedor.
- Nunca guardar número de cartão ou CPF de doador no Nethanel Elo: checkout hospedado no Asaas.
- Caso um boleto ou Pix esteja pendente, isso não altera permissões nem bloqueia recursos do aplicativo.
