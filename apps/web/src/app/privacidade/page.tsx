import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidade | Nethanel Elo",
  description: "Política de Privacidade do aplicativo Nethanel Elo.",
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="space-y-3">
    <h2 className="text-xl font-semibold text-zinc-950">{title}</h2>
    <div className="space-y-3 text-sm leading-7 text-zinc-600">{children}</div>
  </section>
);

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-5 py-10 text-zinc-950">
      <article className="mx-auto max-w-3xl rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">
          Nethanel Elo
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          Política de Privacidade
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Última atualização: 28 de setembro de 2026.
        </p>

        <div className="mt-10 space-y-9">
          <Section title="1. Sobre esta política">
            <p>
              Esta política explica como o Nethanel Elo trata dados pessoais no
              aplicativo e nos recursos vinculados à plataforma. O Elo foi criado para
              apoiar a administração, comunicação e experiência de igrejas e seus
              participantes.
            </p>
          </Section>

          <Section title="2. Dados que podem ser coletados">
            <p>
              Conforme os recursos utilizados, podemos tratar dados de identificação e
              contato, como nome, e-mail, telefone e data de nascimento; informações de
              vínculo e função na igreja; dados de agenda, cultos, escalas e equipes;
              pedidos de oração e atendimento pastoral; dados de crianças cadastrados
              por seus responsáveis no Elo Kids; configurações da igreja; e
              identificadores técnicos necessários a autenticação, segurança e envio de
              notificações.
            </p>
            <p>
              Recursos financeiros destinados à administração da igreja podem registrar
              informações operacionais e contábeis inseridas por usuários autorizados.
              O Elo não vende dados pessoais.
            </p>
          </Section>

          <Section title="3. Para que usamos os dados">
            <p>
              Os dados são usados para autenticar usuários, vincular pessoas à igreja
              correta, disponibilizar funcionalidades contratadas, organizar cultos e
              escalas, enviar comunicações e lembretes, prestar suporte, permitir fluxos
              de cuidado pastoral e Elo Kids, manter segurança e auditoria, prevenir
              abuso e cumprir obrigações legais aplicáveis.
            </p>
          </Section>

          <Section title="4. Dados sensíveis e dados de crianças">
            <p>
              Por ser uma plataforma voltada a igrejas, determinadas informações podem
              revelar vínculo religioso e, portanto, receber proteção reforçada. O
              acesso é limitado de acordo com o perfil e a função do usuário.
            </p>
            <p>
              No Elo Kids, dados de crianças são cadastrados e administrados por seus
              responsáveis e por pessoas autorizadas pela igreja. A criança não precisa
              criar uma conta própria para esse fluxo. A igreja e os responsáveis devem
              inserir somente as informações necessárias ao cuidado e à segurança.
            </p>
          </Section>

          <Section title="5. Fornecedores e compartilhamento">
            <p>
              Podemos utilizar fornecedores de infraestrutura, banco de dados,
              autenticação, notificações e serviços técnicos indispensáveis ao
              funcionamento do Elo. Esses provedores processam dados conforme a
              finalidade do serviço e as configurações da plataforma.
            </p>
            <p>
              Não comercializamos dados pessoais e não os compartilhamos para fins de
              publicidade comportamental.
            </p>
          </Section>

          <Section title="6. Segurança">
            <p>
              Adotamos controles técnicos e organizacionais para reduzir riscos de
              acesso indevido, alteração, perda e exposição, incluindo autenticação,
              controle de permissões e transmissão protegida de dados. Nenhum sistema é
              absolutamente imune a incidentes, por isso os controles são revisados ao
              longo da evolução do produto.
            </p>
          </Section>

          <Section title="7. Retenção e exclusão">
            <p>
              Os dados são mantidos pelo período necessário para fornecer os recursos
              do Elo e atender finalidades legítimas, contratuais, de segurança,
              auditoria ou obrigações legais. Quando uma conta é excluída, dados
              pessoais associados são removidos ou anonimizados quando aplicável,
              ressalvadas hipóteses em que a retenção seja exigida ou permitida por lei.
            </p>
            <p>
              A solicitação de exclusão pode ser feita dentro do aplicativo em
              “Perfil → Privacidade e conta” ou pela página pública de exclusão.
            </p>
          </Section>

          <Section title="8. Direitos do titular">
            <p>
              O titular pode solicitar informações sobre o tratamento, correção,
              atualização ou exclusão de dados, observadas as limitações legais e os
              papéis da igreja e da Nethanel Tecnologia no tratamento das informações.
            </p>
          </Section>

          <Section title="9. Solicitações de privacidade">
            <p>
              Para solicitar exclusão da conta e dados associados, utilize o formulário
              oficial de exclusão. O pedido passa por verificação para evitar remoções
              indevidas.
            </p>
            <Link
              href="/excluir-conta"
              className="inline-flex rounded-xl bg-zinc-950 px-4 py-3 font-semibold text-white"
            >
              Solicitar exclusão de conta
            </Link>
          </Section>
        </div>
      </article>
    </main>
  );
}
