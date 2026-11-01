# Elo Web — plano de unificação

## Estado atual
- O Worker Cloudflare já entrega o Estúdio da Igreja em `apps/web`.
- As funções operacionais existentes permanecem implementadas em `apps/mobile` (React Native/Expo).
- O Supabase `Nethanel Church` é a fonte única de dados e permissões.
- Esta implementação está numa branch **separada** da branch de produção do Cloudflare. Não trocar o domínio até validar paridade funcional.

## Fase 1 — Fundamento web (esta proposta)
- Rota autenticada `/elo`, com acesso à igreja por `get_my_context`.
- Organização selecionada validada contra a lista disponível na sessão do usuário.
- Consultas reais: eventos publicados, `list_my_schedule`, notificações destinadas ao usuário.
- Somente leitura; **nenhuma operação de escrita, pagamento ou envio de push**.
- Acesso ao Estúdio mantido para perfis com função administrativa; as permissões reais continuam impostas pelo Supabase/RLS.

## Fase 2 — Operação e equipe
- Recriar na web as telas de cultos recorrentes e especiais, eventos e inscrições.
- Gestão de pessoas, departamentos e escalas, mantendo RPCs, autorização e fluxos de substituição.
- Comunicação segmentada e avisos, incluindo controle de leitura, com testes de permissão multi-igreja.
- Suporte a convites e fluxos de onboarding sem redirecionar para esquemas de APK.

## Fase 3 — Módulos sensíveis
- Elo Kids: check-in/retirada, responsabilidade de adultos, alertas de emergência e confirmação de recebimento, com testes de notificação em dispositivos reais.
- Atendimento pastoral e monitor de sentimentos, com autorização restrita e proteção dos dados.
- Financeiro e contribuições: manter integrações e webhooks existentes; testar no sandbox antes de qualquer pagamento real.
- Personalização da igreja (logo, ícone PWA, cores) sem fabricação de APK por igreja.

## Critérios para transferir domínio
1. Build do vinext aprovado.
2. Fluxos de login, sessão, expiração e troca de conta validados.
3. Isolamento de dados entre organizações/perfis validado usando contas de teste.
4. Paridade funcional dos módulos necessários à publicação, incluindo Push/PWA.
5. Testes no Android, iOS e desktop, inclusive atualização/retorno de rota.
6. Aprovação explícita antes de migrar DNS ou desativar a Vercel.

## Observação
`apps/mobile` não pode ser importado integralmente como componente Next.js: depende de navegação e APIs nativas (Expo/React Native). Reaproveitar regras e interfaces de dados é possível, mas a experiência web requer adaptação de UI e testes de integração.
