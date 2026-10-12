# Nethanel Elo — atualizacoes de APKs de igrejas (v56)

## Objetivo e limite de ativacao
Preparar um unico motor de codigo para varias igrejas com marca propria, mantendo:
- Android applicationId e deeplink imutaveis por organizacao;
- chave privada de assinatura fora do banco e fora do APK;
- fingerprint SHA-256 do certificado por igreja e verificacao antes de distribuir;
- versionCode inteiro monotonicamente crescente em cada pacote Android;
- releases inicialmente em `draft`/`testing`, nunca publicacao automatica.
Esta fase adiciona catalogo, leitura segura, fluxo de solicitacao e verificacao de assinatura. **Nao dispara compilacao nem distribui atualizacoes por conta propria**, nao muda a fila de APK atual e nao publica releases. A tela de aviso ja foi preparada, mas permanece inativa ate existir um release publicado e testado.

## Estados / fluxo
1. Nethanel prepara release central `draft` -> `testing`.
2. Build canary com o MESMO package+keystore de uma igreja teste; verificar via apksigner e Android PackageManager instalando por cima. Se houve APK anterior, obter fingerprint real do anterior e registrar baseline, nao inferir chave.
3. Criar build por igreja elegivel com release_id e versionCode. Nunca reaproveitar APK de outra igreja.
4. Conferir integridade, identidade, autenticacao, push e assinatura. Aguardar aprovacao manual.
5. Marcar release `published` no banco apenas depois da aprovacao. Entrega via download privado para membros; nao por URL publica.
6. App autenticado compara seu versionCode nativo com o ultimo build publicado para a igreja e oferece instalacao pelo Android; se abaixo do minimo suportado, atualizar sera obrigatorio (na proxima etapa de UX).
7. `paused` / `rolled_back` retiram distribuicao de novos downloads; APK instalado nao e revertido automaticamente e rollback Android exige novo versionCode.

## Separacao de tipos de atualizacao
- **Dados, cores e logo dentro da interface**: ler configuracao da organizacao no Supabase, sem APK.
- **Codigo JS/estilos**: OTA somente se `expo-updates` instalado em binarios novos, runtime e canal compativeis e rollout de tenant testado.
- **Icone no launcher, Firebase, native libs, permissoes, Expo SDK**: novo APK / AAB assinado, com versao nativa nova.

IMPORTANTE: hoje ha um unico `extra.eas.projectId` compartilhado pelos APKs white-label. Um EAS Update publicado num mesmo channel+runtime pode chegar a OUTRAS igrejas. **Nao habilitar OTA em massa nem configurar channel generico**. Primeiro isolar o namespace por igreja (channel+runtime), ou remover qualquer marca compilada do pacote JS distribuido e provar isolamento total. Nesta fase OTA permanece somente catalogado, sem publicacao.

## Criterios de seguranca
- Banco: catalogo + identidade privada, RLS habilitada, escrita exclusiva service_role; RPC apenas para usuario autenticado e membro da mesma igreja.
- Storage: somente APK `ready` referenciado por release de producao `published`, pertencente a igreja do membro.
- Antigo `church_apk_builds` fica compativel (novas colunas nulas nas linhas legadas). Nenhuma linha antiga vira release automaticamente.
- Nao expor bucket, service_role, chave FCM, ou keystore. Signed URL com expiracao curta e apenas apos autenticacao.
- Validar `applicationId`, `versionCode`, `versionName`, SHA-256 da assinatura e SHA-256 do arquivo **antes** de registrar como pronto.
- Nunca liberar se a assinatura do APK anterior nao tiver sido reconhecida.
- Tela de atualizacao deve usar `Application.nativeBuildVersion` de `expo-application` (instalado/registrado posteriormente), NUNCA numero de bundle JS/OTA como versao nativa.
- Nao alterar aplicativos ja instalados ate os testes de substituicao serem aprovados.

## Integracao planejada (etapa seguinte)
- Factory: adaptar `scripts/elo_app_factory.py` para reservar versao de forma atomica, verificar fingerprint e persistir release_id; segregar jobs para nao recompilar centenas de igrejas a cada deploy.
- EAS build: `appVersionSource=local` somente no perfil de APK white label, para respeitar versionCode por igreja, preservando o perfil generico. Confirmar credenciais Android persistentes por pacote.
- Mobile: aviso de release APK ja adicionado, usa versionCode nativo Android via Constants.platform como etapa transitoria e Signed URL por igreja. Em uma iteracao posterior instalar `expo-application` e substituir API depreciada, validar instalacao real e interacao com o alerta do Elo Kids.
- Painel Nethanel: criar `Central de atualizacoes` com versoes, status de builds, canary, aprovar publicacao, pausar, logs, progresso por igreja. Nenhum deploy Vercel ou EAS production sem autorizacao.

## Testes obrigatorios
1. A e B sao igrejas diferentes: A nunca consulta/baixa APK de B.
2. Release `draft`, `testing`, `paused` nunca disponibiliza download.
3. Build `queued` ou `failed` nunca retorna atualizacao.
4. Mesmo package + mesma chave + versionCode maior: update sobreposto no Android, dados e login preservados.
5. Package ou SHA de assinatura diferente: falha antes de publicar e instalacao bloqueada.
6. Atualizacao JS nao carrega em runtime nativo incompativel.
7. Recompilar com variacao de icone preserva package/keystore, incrementa versionCode.
8. Release forcada so ativa apos teste de download e instalacao funcionando.

## Arquivos
- `supabase/migrations/20261012013054_elo_app_updates_v56.sql`: registro de versoes, identidade e download por membro, RPC com isolamento. Aplicada no Supabase em 11/10/2026 (horario Brasil).\n- `scripts/elo_verify_apk.py`: confere APK novo com APK anterior, versao crescente e certificado.\n- `apps/mobile/src/features/notifications/ChurchApkUpdatePrompt.tsx`: interface de atualizacao autenticada por igreja.\n- No momento da estruturacao: **0 releases publicados**, **1 solicitação de APK existente na fila**; nenhuma distribuicao ativada.
