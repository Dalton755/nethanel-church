# Google Play — Release Nethanel Elo

Atualizado em 28/09/2026.

## Identidade

- Nome da loja: **Nethanel Elo**
- Pacote Android atual: `br.com.nethanel.church`
  - Mantido nesta primeira publicação para preservar Firebase/FCM e o histórico técnico do projeto.
  - O nome exibido ao usuário permanece **Nethanel Elo**.
- Versão pública inicial: **1.0.0**
- Formato de produção: **Android App Bundle (.aab)**
- Expo SDK: **57**
- Target Android: **API 36**

## Texto sugerido para a ficha

### Descrição breve

Conecte sua igreja, equipes, cultos, cuidado e comunicação em um só app.

### Descrição completa

O Nethanel Elo conecta pessoas, igreja e tecnologia em uma experiência simples para a rotina da comunidade.

Organize cultos, séries e eventos, acompanhe sua agenda, monte escalas por departamento e mantenha cada pessoa informada sobre seus compromissos.

Para líderes e equipes, o Elo reúne recursos de organização, comunicação, permissões e acompanhamento. Para membros, a experiência destaca o próximo culto, compromissos, avisos, pedidos de oração e atendimento pastoral.

Com o Elo Kids, responsáveis podem cadastrar seus filhos, fazer check-in nos cultos e receber avisos da equipe responsável quando necessário.

Entre os recursos disponíveis estão:

- agenda de cultos e eventos;
- cultos recorrentes, séries e campanhas;
- escalas por departamentos e funções;
- convites e agenda de pregadores;
- comunicação e notificações;
- pedidos de oração;
- atendimento pastoral;
- Elo Kids e check-in de crianças;
- contribuição com informações de Pix da igreja;
- gestão financeira para perfis autorizados;
- personalização da igreja;
- perfis e permissões por função.

Os recursos exibidos podem variar conforme o perfil do usuário e o plano utilizado pela igreja.

O Nethanel Elo foi pensado para reduzir tarefas soltas e transformar a rotina da igreja em uma experiência organizada, clara e conectada.

## URLs públicas necessárias

Antes do envio para teste fechado/produção, publicar o app web do projeto e usar:

- Política de Privacidade: `/privacidade`
- Exclusão de conta: `/excluir-conta`

O domínio final deve ser HTTPS, público e permanecer ativo durante a revisão.

## Segurança dos dados — mapa preliminar

Revisar no Play Console com base na versão final distribuída.

Categorias potencialmente coletadas pelo Elo:

- nome;
- e-mail;
- telefone;
- data de nascimento;
- vínculo/função na igreja;
- agenda, cultos e escalas;
- pedidos de oração e atendimento pastoral;
- dados de crianças cadastrados por responsáveis;
- conteúdo enviado por usuários autorizados, como imagens de cultos/logos;
- identificadores técnicos de dispositivos usados para notificações;
- registros administrativos/financeiros quando associados a pessoas.

Práticas já previstas no produto:

- transmissão por HTTPS;
- autenticação Supabase/Google;
- RLS e permissões por organização;
- fluxo de solicitação de exclusão de conta;
- política de privacidade dentro do app e na web;
- sem venda de dados pessoais.

## Permissões Android a revisar

- Notificações: necessárias para alertas e lembretes.
- Câmera: usada no leitor de QR.
- Galeria/fotos: usada somente quando o usuário escolhe enviar imagem em recursos compatíveis.
- Microfone: não é utilizado pelo leitor de QR.

## Acesso para revisão

Como o aplicativo possui recursos após autenticação, o Play Console precisará de instruções claras de acesso.

Não usar conta pessoal do proprietário na revisão.

Criar antes do envio:
- uma igreja DEMO isolada;
- uma conta exclusiva de revisão;
- dados fictícios;
- pelo menos um culto futuro;
- uma escala;
- dados demonstrativos nos módulos principais.

## Testes

Se a conta pessoal do Play Console foi criada após 13/11/2023:
- teste fechado;
- mínimo de 12 testadores;
- 14 dias consecutivos inscritos;
- depois solicitar acesso à produção.

Para outras contas, seguir os requisitos mostrados no próprio Play Console.

## Checklist antes de enviar

- [x] Expo SDK compatível com API 36
- [x] perfil EAS de produção gera AAB
- [x] política de privacidade criada no projeto
- [x] exclusão de conta dentro do app
- [x] solicitação externa de exclusão criada no projeto web
- [x] backend de exclusão criado
- [ ] app web publicado em domínio HTTPS
- [ ] ícone de loja 512x512 validado
- [ ] feature graphic criada
- [ ] capturas de tela finais
- [ ] conta DEMO para revisão
- [ ] ficha do Play Console criada
- [ ] Segurança dos dados preenchida
- [ ] classificação indicativa preenchida
- [ ] público-alvo definido
- [ ] AAB enviado ao Play Console
