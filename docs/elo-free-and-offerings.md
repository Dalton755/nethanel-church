# Nethanel Elo — gratuidade e ofertas voluntárias

**Atualizado em outubro de 2026 — HOMOLOGAÇÃO**. A implementação do Sandbox está isolada na `feature/elo-updates-foundation`, sem merge em `main`, sem publicar APK em loja ou ativar cobranças reais. A migração de acesso gratuito para todas as igrejas continua em rascunho e NÃO foi aplicada.

## Ofertas no app de prévia

- A tela “Ofertar ao desenvolvedor” está disponível para perfis autorizados (owner/admin/pastor/tesoureiro).
- Somente a organização `101212c5-6e81-4915-ae9a-fbde5b42bb04` (Elo Church Demo) está liberada para ofertas Sandbox.
- Valores sugeridos R$ 20/50/100/200 e campo livre a partir de R$ 5. Oferta opcional sem conceder recursos extras.
- **Pix avulso:** o servidor consulta `GET /pix/addressKeys?status=ACTIVE` do Asaas Sandbox, cria QR **estático de uso único** `POST /pix/qrCodes/static` (value, externalReference, `allowsMultiplePayments:false`, expiração) e devolve o `payload` Pix ao app. O app gera o QR localmente com `react-native-qrcode-svg` e permite **Pix Copia e Cola** com `expo-clipboard`. Não há formulário Asaas ou criação de cadastro de pagador nesta modalidade.
- **Pré-requisito:** a conta Asaas Sandbox deve possuir ao menos uma chave Pix ativa. Chave API de Sandbox `ELO_ASAAS_SANDBOX_API_KEY` fica exclusivamente no Supabase (nunca no app). Uma chave ausente/inválida ou sem Pix ativo retorna uma mensagem, sem gerar QR falso.
- **Pix mensal:** até implementação específica de recorrência Pix, mantém-se o fluxo anterior de Payment Link com pagamento mensal manual, via Asaas. Cartão/boleto também continuam hospedados, em Sandbox. Não chamar QR Pix mensal de assinatura automática.
- Os dados da oferta ficam na tabela de acesso restrito `elo_developer_donations` com `provider_pix_qr_id` e `pix_payload`; o histórico mostra pendência ou pagamento confirmado.
- Eventos de QR são conciliados por `payment.pixQrCodeId` ou referência externa `elo-donation:<id>`, conferindo organização, ambiente e valor em centavos. Webhook com token Asaas, idempotência por evento; não registra CPF nem número de cartão.
- Nunca atualizar `organization_subscriptions`, planos ou dados contábeis das igrejas como efeito de uma oferta.

## Migrações e funções efetivamente aplicadas no Supabase

- `20261013002628_elo_asaas_sandbox_webhook_receipts_v61.sql`: registros de teste antigos, isolados.
- `20261013004655_elo_donations_sandbox_demo_v62.sql`: apenas ofertas Sandbox da Elo Church Demo, funções RPC com validação de perfil.
- `20261013020602_elo_sandbox_inline_pix_qr_v63.sql`: colunas de QR Pix e restrições de uso único na Demo.
- Edge Functions `elo-developer-donations` (`verify_jwt=true`) e `elo-asaas-sandbox-webhook` (token exclusivo com `verify_jwt=false`), ambas limitadas ao Sandbox e à Demo.
- Não implantar `20261012190000_elo_free_for_all_draft.sql` sem autorização explícita.

## Pix mensal manual — implementação em prévia, SEM ativação no backend

- O usuário pode optar por "Oferta mensal" + "Pix". Cada mês gera um Pix **por solicitação**, dentro do app, sem criar checkout externo e **sem débito automático**.
- O compromisso não é uma assinatura financeira automática. Um mês já pago não gera nova cobrança; a próxima competência terá outro QR próprio. Não há juros, multas nem bloqueios por não ofertar.
- Os períodos ficam em `elo_developer_monthly_pix_cycles`, com unicidade por oferta/mês, histórico por competência, eventos idempotentes e acesso restrito à Demo.
- O cancelamento impede a criação de novos Pix; QR já emitido pode existir até expirar e é tentado revogar no Sandbox. Pagamentos confirmados permanecem no histórico.
- Migração preparada: `20261013110000_elo_monthly_pix_sandbox_draft.sql`. **NÃO APLICADA no Supabase**; somente depois de autorização explícita para alterar o banco compartilhado em homologação.
- Funções `elo-developer-donations` e `elo-asaas-sandbox-webhook` modificadas no GitHub, **SEM deploy** nesta fase.
- Testes estáticos de SQL, Deno, 4 cenários de ciclo mensal e UI React Native passaram; build de APK de prévia em execução. Todas as formas de contribuição continuam sendo apenas Sandbox.

## Homologação pendente

1. APK de prévia com QR nativo e botão “Copiar código Pix” deve ser compilado, instalado e testado.
2. Validar chave API de Sandbox atual e **chave Pix ativa** no Asaas Sandbox. Um smoke automatizado com a chave guardada no GitHub encontrou HTTP 401, sugerindo que aquela chave no GitHub está desatualizada/revogada; isso não comprova o estado do segredo distinto no Supabase.
3. Gerar QR Pix avulso por dentro do app, confirmar que o código é aceito por uma conta pagadora Sandbox e que o webhook muda o histórico para “Pagamento confirmado”.
4. Testar duplicidade de evento, expiração do QR, bloqueio fora da Demo, cartões, boletos, recorrência mensal e cancelamento antes de considerar liberação.
5. Qualquer implantação em produção ou liberação para outras igrejas exige autorização específica.

**Segurança:** não compartilhar tokens, não fazer pagamentos reais, não enviar CPF/CEP/cartão para ChatGPT ou para o app de homologação.
