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
