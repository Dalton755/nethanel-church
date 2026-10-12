# Central de Atualizações — Nethanel Elo (prévia interna)

## Objetivo
Criar no **Perfil > Painel Nethanel > Central de Atualizações** uma gestão central da frota de APKs white-label, mantendo controle de release por igreja e distinguindo **APK gerado** de **versão realmente informada pelo app**.

## Recursos desta etapa
- Catálogo de versões (1.0.x, versionCode crescente global, notas, versão mínima, canal prévia/produção).
- Criação de **rascunho** sem build, push, deploy ou publicação.
- Início de testes **somente no canal de prévia**; consulta de preview fica restrita ao solicitante original do Elo Church Demo, conforme migration v57.
- Pausar e marcar release como retirado; suspensão interrompe a oferta a quem ainda não baixou. Não é downgrade de APK já instalado.
- Visão por igreja: último build, fila, versão do APK gerado, erros e versão informada por contas autenticadas.
- Relato seguro de versão instalada: RPC `report_church_app_version`, validando pertinência à igreja e o package Android. Uma conta informa uma versão por igreja; várias instalações na mesma conta não são contadas individualmente.
- Apenas administradores ativos da **plataforma** consultam ou alteram a Central (RPC com guarda no banco). Igreja não pode cadastrar releases.
- `request_church_app_update` exige release **production/published**. Assim, igreja não consegue acionar a fábrica do GitHub para builds de preview.

## Limites intencionais
- **Sem botão de publicar produção**. É necessária aprovação explícita do responsável para permitir promoção e distribuição.
- **Sem enfileiramento automático** de APKs nesta fase. Workflow de produção é disparado a partir da branch `main`, portanto enfileirar um release em desenvolvimento pode fazer um executor de produção processar código incompatível.
- **Sem disparar notificações em massa** antes do pipeline de distribuição revisado e canary.
- Acompanhar downloads e atualizações não significa garantir instalação do Android: usuários podem baixar sem instalar; relatórios por conta só aparecem quando o app atualizado volta a consultar.
- Testes em prévia **não devem ser confundidos com produção**.
- Compartilhar o mesmo `versionCode` entre igrejas preserva ordem de versões; package e assinatura continuam exclusivos por organização.

## Próxima fase, com autorização
1. Validar com usuário o visual e o cadastro de rascunhos na central.
2. Integrar fila de build revisada na branch principal, apenas após teste de assinatura, versão monotônica, Firebase e limite de concorrência por igreja.
3. Implementar aprovação explícita de promoção a produção (auditoria de quem aprovou), rollout gradual por igreja e reversão.
4. Integrar push ao catálogo de release publicado para os destinatários escolhidos.
5. Confirmar o fluxo Android em aparelho real; sem instalação silenciosa.


## Nova etapa: Simular distribuição por igreja (v59)
- Cada card de versão apresenta "Simular distribuição por igreja", acessível somente no Painel Nethanel.
- A tela permite escolher uma ou várias igrejas, sem enviar avisos nem iniciar builds.
- A RPC `platform_admin_update_distribution_preview` é somente leitura e só atende administradores ativos da plataforma.
- A simulação considera: igreja ativa, plano efetivo incluindo Elo Abençoar, APK pronto anterior, fila/compilação em andamento, pacote Android e monotonicidade do versionCode.
- Versões `preview` **nunca** incluem outras igrejas além do Elo Church Demo. O usuário visualiza destinos bloqueados como indisponíveis.
- `eligible_for_preflight` **não** é autorização para publicar nem confirmação de compatibilidade: ainda é necessário verificar o APK anterior e o certificado.
- Releases pausados/retirados são bloqueados. Um APK já instalado não pode sofrer downgrade.
- Não há botão de enfileirar, publicar, aprovar produção ou enviar Push nesta etapa.
- A rotina permanece no branch de desenvolvimento, e o novo APK de prévia do Elo principal valida sua assinatura e versionCode em relação ao APK instalado anteriormente.

### Casos testados
- Preview 1.0.7: Elo Church Demo = APK já preparado; demais 4 igrejas = restritas a Demo; execução desativada.
- Existe 1 APK pendente em outra igreja que permanece inalterado.
- Nenhum release `production/published` foi criado.
- Validação TypeScript e Expo no GitHub executada sem deploy.


## Fase de rascunhos de distribuição (v60)
- No resultado da simulação há um formulário discreto para nomear e **salvar planejamento**.
- A RPC `platform_admin_save_distribution_draft` registra a seleção exclusivamente como `draft`.
- Os rascunhos podem ser listados e reabertos pela conta de administrador da plataforma. A nova tabela não concede acesso direto a usuários comuns nem habilita execução.
- `preview` é rigorosamente limitado ao Elo Church Demo (um único destinatário). Produção pode ser planejada, mas **não publicada**.
- O banco rejeita igrejas desconhecidas, repetidas, valores nulos e versões fora do estado rascunho/teste.
- Backend verificado usando uma transação revertida e nenhuma solicitação real enviada. Monitor de compilação da prévia do Elo principal valida package, certificado e versão crescente relativamente ao último APK instalado.
- Passos de promoção, enfileiramento de build, push ou deploy de produção continuam indisponíveis nesta etapa.
