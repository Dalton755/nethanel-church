# Homologação gratuita — sem Supabase Branch paga

**Não executar migrações no banco de produção.**

## Requisitos locais
- Docker Desktop ou Docker Engine com suporte a containers.
- Node.js e npm.
- Supabase CLI instalado (consultar `supabase --help` para a versão em uso).

## Preparação
1. Faça checkout de `feature/elo-monitor-bem-estar`.
2. Inicie o Supabase local: `supabase start`. O comando deve ser executado na raiz do repositório.
3. Use `supabase status` para consultar URL e chaves **locais**. Nunca use chaves reais de produção.
4. Aplique as migrações em um banco **descartável**, respeitando a ordem de dependências. Se o projeto não possuir um baseline reproduzível, restaure um schema sanitizado antes das migrações.
5. No `apps/web`, configure variáveis locais apontando exclusivamente para o Supabase local.
6. Execute `npm ci`, `npm run typecheck`, `npm run build` e os testes de bem-estar com `node --test src/features/wellbeing/*.test.mjs`.

## Testes obrigatórios de isolamento
- Criar igreja A e igreja B, dois membros de A, um pastor de A e um pastor de B.
- Com sessão do membro A, criar/alterar/excluir o próprio check-in; impedir escrita no registro de B.
- Pastor A só vê check-ins com consentimento de A; pastor B não vê nada de A.
- Revogar consentimento e confirmar que a consulta pastoral retorna zero registros.
- Solicitar contato sem consentimento deve falhar tanto na interface quanto no banco.
- Alterar organização de um registro deve falhar.
- Lembrete diário só é elegível com opt-in, sem check-in no dia e com token ativo.
- Não executar o worker contra tokens reais durante a homologação.

## Publicação
Aprovação explícita é necessária antes de aplicar migrações ou publicar em produção.
