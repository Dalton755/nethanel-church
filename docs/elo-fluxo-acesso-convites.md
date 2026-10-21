# Fluxo oficial de acesso e permissões — Nethanel Elo

## Entrada
- Link institucional: criação de igreja e cadastro do administrador fundador.
- Link/QR Code de igreja: login simples; vínculo inicial **membro** ou **visitante**, sem permissões administrativas.
- Nunca atribuir administrador apenas por primeiro login no link da igreja.
- A interface deve respeitar as permissões efetivas validadas no servidor.

## Dimensões independentes
1. Vínculo: visitante, membro, congregado.
2. Cargo eclesiástico: cooperador, diácono, presbítero, obreiro, pastor etc.
3. Função de acesso: administrador, pastor presidente, pastor, tesoureiro, mídia, secretaria, líder de departamento.

## Convites
- Somente pessoas autorizadas emitem convite individual, com destinatário, igreja, emissor, validade, status e trilha de auditoria.
- Aceite exige autenticação como destinatário.
- Convite para congregado: **aceite → cadastro completo → ativação automática**; não há segunda aprovação.
- Cadastro em etapas, com rascunho: dados pessoais (nome, nascimento, WhatsApp, estado civil); endereço (CEP com busca e edição manual, número, complemento); vida eclesiástica (batismo opcional, cargo declarado, departamento); revisão.
- Cargo declarado no formulário não atribui papel de acesso.
- Convites para funções especiais: aceite e cadastro necessário ativam apenas a função concedida.

## Permissões
- Membro e visitante: **sem acesso a escalas**.
- Congregado: visualizar apenas as próprias escalas.
- Líder de departamento: gerenciar somente escalas dos departamentos sob sua liderança.
- Pastor: cuidado de pessoas, sem tesouraria por padrão; autorização financeira individual apenas pelo pastor presidente.
- Tesoureiro: acesso financeiro, sem acesso pastoral por implicação.
- Pastor presidente e administrador: acesso administrativo completo; dados pastorais sensíveis continuam sujeitos a consentimento e regras de privacidade.
- Toda autorização/revogação deve ser aplicada por RLS ou validação no servidor, nunca apenas ocultando botões.

## Sucessão
- Administrador deixa a igreja: pastor presidente assume a administração e pode nomear um **congregado** como novo administrador.
- Transferência revoga poderes anteriores, preserva dados e gera auditoria.
- Impedir remoção do último responsável sem sucessor válido.
- Em caso de ausência de presidente designado, exigir procedimento seguro de recuperação; nunca promover automaticamente um membro comum.

## Implantação
- Adaptar tabelas existentes `people`, `organization_memberships`, `roles`, `user_role_assignments` e `role_permissions`.
- Não modificar dados ou políticas de produção antes de revisar migrações e testar numa igreja fictícia.
- Publicar apenas em preview até aprovação explícita.
