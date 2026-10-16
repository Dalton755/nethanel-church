# Homologação — Monitor de Sentimentos

**Status:** pendente de execução em ambiente isolado. Não publicar em produção.

## Preparação
- Confirmar projeto Supabase realmente usado pelo Elo (não usar o banco do antigo Nethanel Church por suposição).
- Criar banco de homologação e aplicar as migrações na ordem; revisar políticas RLS e papéis pastorais reais.
- Criar contas de teste de membro A, membro B, pastor da igreja A e pastor da igreja B.
- Validar build, typecheck e lint pelo CI; registrar evidências.

## Cenários obrigatórios
1. Membro registra quatro notas, observação e visualiza histórico.
2. Atualiza registro do mesmo dia sem criar duplicidade; nota e consentimento anteriores são preservados.
3. Membro desmarca compartilhamento; pastor deixa de consultar registro imediatamente.
4. Membro solicita contato: só salva com consentimento explícito.
5. Membro B não consegue consultar nem alterar dados de A.
6. Pastor da igreja A vê apenas registros consentidos da igreja A; pastor B não os vê.
7. Usuário comum não acessa painel pastoral via API, mesmo digitando a URL.
8. Sequências de 2, 3 e 5 dias; quebras de sequência e ausência de resposta não geram alerta.
9. Lembretes: opt-in, sem envio após check-in, sem token, opt-out, timezone Brasília e prevenção de duplicatas.
10. Testar visualização no Android e desktop, falhas de rede e sessão expirada.

## Bloqueadores para disponibilizar prévia
- Implementar e configurar worker de push usando infraestrutura real do Elo.
- Aplicar e testar migrações somente em banco de homologação.
- Verificar CI e testes de RLS em ambiente isolado.
