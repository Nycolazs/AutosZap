import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Politica de Privacidade — AutosZap',
  description:
    'Saiba como o AutosZap coleta, utiliza, armazena e protege seus dados pessoais em conformidade com a LGPD.',
  alternates: { canonical: 'https://autoszap.com/privacidade' },
};

const lastUpdated = '21 de marco de 2026';

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-dvh bg-[#060918] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#060918]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/brand/autoszap-mark.png"
              alt="AutosZap"
              width={32}
              height={32}
              className="h-7 w-7 object-contain"
              priority
            />
            <span className="font-heading text-base font-bold tracking-tight">AutosZap</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-white/60 transition hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8 sm:py-16">
        {/* Title */}
        <div className="mb-10 border-b border-white/[0.08] pb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-400">
            Documento legal
          </p>
          <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Politica de Privacidade
          </h1>
          <p className="mt-3 text-sm text-white/50">
            Ultima atualizacao: {lastUpdated}
          </p>
        </div>

        {/* Content */}
        <article className="prose-policy space-y-8 text-[15px] leading-[1.8] text-white/70">
          <Section title="1. Introducao">
            <p>
              A <strong className="text-white">AutosZap</strong> (&ldquo;nos&rdquo;, &ldquo;nosso&rdquo; ou &ldquo;Plataforma&rdquo;), inscrita no CNPJ sob o numero [a ser preenchido], com sede em [endereco a ser preenchido], e a controladora dos dados pessoais tratados por meio da plataforma disponivel em{' '}
              <a href="https://autoszap.com" className="text-blue-400 hover:underline">autoszap.com</a>.
            </p>
            <p>
              Esta Politica de Privacidade descreve como coletamos, utilizamos, armazenamos, compartilhamos e protegemos os dados pessoais dos usuarios em conformidade com a Lei Geral de Protecao de Dados (LGPD — Lei n. 13.709/2018) e demais normas aplicaveis.
            </p>
            <p>
              Ao utilizar a Plataforma, voce declara estar ciente e de acordo com as praticas descritas neste documento.
            </p>
          </Section>

          <Section title="2. Dados pessoais coletados">
            <p>Coletamos os seguintes dados, conforme a finalidade e o contexto de uso:</p>

            <h4 className="mt-4 text-sm font-semibold text-white">2.1 Dados de cadastro e conta</h4>
            <ul className="ml-4 list-disc space-y-1">
              <li>Nome completo</li>
              <li>Endereco de email</li>
              <li>Senha (armazenada de forma criptografada com hash bcrypt)</li>
              <li>Nome da empresa e segmento de atuacao</li>
              <li>Cargo ou funcao na empresa</li>
              <li>Foto de perfil (opcional)</li>
            </ul>

            <h4 className="mt-4 text-sm font-semibold text-white">2.2 Dados de uso e acesso</h4>
            <ul className="ml-4 list-disc space-y-1">
              <li>Endereco IP</li>
              <li>Identificador do navegador (User-Agent)</li>
              <li>Data e horario de acesso</li>
              <li>Registros de atividade (logs de auditoria)</li>
            </ul>

            <h4 className="mt-4 text-sm font-semibold text-white">2.3 Dados de contatos e conversas</h4>
            <ul className="ml-4 list-disc space-y-1">
              <li>Nome e numero de telefone dos contatos cadastrados pelo usuario</li>
              <li>Conteudo das mensagens enviadas e recebidas via WhatsApp</li>
              <li>Status de entrega das mensagens (enviado, entregue, lido)</li>
              <li>Notas internas criadas pela equipe sobre conversas</li>
              <li>Tags e segmentacoes atribuidas aos contatos</li>
            </ul>

            <h4 className="mt-4 text-sm font-semibold text-white">2.4 Dados de campanhas</h4>
            <ul className="ml-4 list-disc space-y-1">
              <li>Nome e conteudo de campanhas de mensagens</li>
              <li>Listas de destinatarios</li>
              <li>Arquivos de midia anexados (imagens)</li>
              <li>Metricas de envio, entrega e leitura</li>
            </ul>

            <h4 className="mt-4 text-sm font-semibold text-white">2.5 Dados coletados via formulario de interesse</h4>
            <ul className="ml-4 list-disc space-y-1">
              <li>Nome, email e telefone</li>
              <li>Nome da empresa e quantidade estimada de atendentes</li>
              <li>Observacoes adicionais</li>
            </ul>

            <h4 className="mt-4 text-sm font-semibold text-white">2.6 Dados de login social</h4>
            <p>
              Ao utilizar login via Google ou Facebook, coletamos seu nome e email do provedor para criar ou autenticar sua conta. Nao temos acesso a senha dessas contas.
            </p>
          </Section>

          <Section title="3. Finalidades do tratamento">
            <p>Os dados pessoais sao tratados para as seguintes finalidades:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Criar e manter sua conta na Plataforma</li>
              <li>Autenticar o acesso via credenciais ou login social (Google, Facebook)</li>
              <li>Permitir o envio e recebimento de mensagens via API oficial do WhatsApp Business</li>
              <li>Gerir contatos, conversas, CRM e campanhas de comunicacao</li>
              <li>Administrar equipes, papeis e permissoes de acesso</li>
              <li>Gerar codigos de convite para novos membros da equipe</li>
              <li>Manter registros de auditoria para seguranca e conformidade</li>
              <li>Prevenir fraudes e abusos por meio de limitacao de requisicoes (rate limiting)</li>
              <li>Responder a solicitacoes de contato e interesse comercial</li>
              <li>Cumprir obrigacoes legais e regulatorias</li>
            </ul>
          </Section>

          <Section title="4. Base legal para o tratamento">
            <p>O tratamento dos dados pessoais e fundamentado nas seguintes bases legais previstas na LGPD:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li><strong className="text-white">Consentimento</strong> (Art. 7o, I): para coleta de dados via formulario de interesse e aceite dos termos durante o cadastro</li>
              <li><strong className="text-white">Execucao de contrato</strong> (Art. 7o, V): para prestacao dos servicos contratados na Plataforma</li>
              <li><strong className="text-white">Legitimo interesse</strong> (Art. 7o, IX): para seguranca da Plataforma, prevencao de fraudes e melhoria do servico</li>
              <li><strong className="text-white">Cumprimento de obrigacao legal</strong> (Art. 7o, II): para atender determinacoes legais e regulatorias</li>
            </ul>
          </Section>

          <Section title="5. Compartilhamento de dados">
            <p>Os dados pessoais podem ser compartilhados com:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <strong className="text-white">Meta Platforms, Inc.</strong> — compartilhamos numeros de telefone dos contatos, conteudo de mensagens e midias enviadas pelo usuario por meio da API oficial do WhatsApp Business Platform, conforme necessario para a operacao do servico de mensageria
              </li>
              <li>
                <strong className="text-white">Google LLC</strong> — ao utilizar login social com Google, seu email e nome sao verificados por meio da API Google OAuth 2.0
              </li>
              <li>
                <strong className="text-white">Meta Platforms, Inc. (Facebook Login)</strong> — ao utilizar login social com Facebook, seu email e nome sao verificados por meio do Facebook SDK
              </li>
            </ul>
            <p className="mt-3">
              <strong className="text-white">Nao vendemos, comercializamos ou compartilhamos dados pessoais com terceiros para fins de marketing ou publicidade.</strong>
            </p>
          </Section>

          <Section title="6. Armazenamento e seguranca">
            <p>Adotamos medidas tecnicas e organizacionais para proteger os dados pessoais:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li><strong className="text-white">Isolamento de dados</strong>: cada empresa possui banco de dados dedicado e independente, impossibilitando o acesso cruzado entre clientes</li>
              <li><strong className="text-white">Criptografia de credenciais</strong>: tokens de acesso ao WhatsApp e chaves sensiveis sao criptografados com AES-256-CBC</li>
              <li><strong className="text-white">Hash de senhas</strong>: senhas sao armazenadas com hash bcrypt (10 rounds), nunca em texto plano</li>
              <li><strong className="text-white">Cookies seguros</strong>: utilizamos cookies httpOnly, Secure e SameSite para autenticacao, inacessiveis a JavaScript do navegador</li>
              <li><strong className="text-white">HTTPS</strong>: todas as comunicacoes em producao sao realizadas por conexao criptografada TLS/SSL</li>
              <li><strong className="text-white">Rate limiting</strong>: limitacao de tentativas de login e cadastro para prevenir ataques de forca bruta</li>
              <li><strong className="text-white">Auditoria</strong>: registros detalhados de acoes realizadas na Plataforma para rastreabilidade</li>
            </ul>
          </Section>

          <Section title="7. Cookies utilizados">
            <p>A Plataforma utiliza os seguintes cookies estritamente necessarios para funcionamento:</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-white">
                    <th className="pb-2 pr-4 font-semibold">Cookie</th>
                    <th className="pb-2 pr-4 font-semibold">Finalidade</th>
                    <th className="pb-2 font-semibold">Duracao</th>
                  </tr>
                </thead>
                <tbody className="text-white/60">
                  <tr className="border-b border-white/[0.05]">
                    <td className="py-2 pr-4 font-mono text-xs">autoszap_access_token</td>
                    <td className="py-2 pr-4">Autenticacao da sessao ativa</td>
                    <td className="py-2">15 minutos</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-xs">autoszap_refresh_token</td>
                    <td className="py-2 pr-4">Renovacao automatica da sessao</td>
                    <td className="py-2">7 dias</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              Nao utilizamos cookies de rastreamento, publicidade ou analytics de terceiros.
            </p>
          </Section>

          <Section title="8. Retencao de dados">
            <p>Os dados pessoais sao retidos enquanto:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>A conta do usuario estiver ativa na Plataforma</li>
              <li>Houver necessidade de cumprimento de obrigacoes legais ou regulatorias</li>
              <li>For necessario para o exercicio regular de direitos em processos judiciais ou administrativos</li>
            </ul>
            <p className="mt-3">
              Dados excluidos sao inicialmente marcados como inativos (exclusao logica) e podem ser removidos definitivamente apos o periodo de retencao aplicavel.
            </p>
          </Section>

          <Section title="9. Direitos do titular">
            <p>
              Em conformidade com a LGPD, voce tem os seguintes direitos em relacao aos seus dados pessoais:
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Confirmar a existencia de tratamento de dados</li>
              <li>Acessar seus dados pessoais</li>
              <li>Corrigir dados incompletos, inexatos ou desatualizados</li>
              <li>Solicitar a anonimizacao, bloqueio ou eliminacao de dados desnecessarios</li>
              <li>Solicitar a portabilidade dos dados</li>
              <li>Obter informacao sobre o compartilhamento de dados</li>
              <li>Revogar o consentimento a qualquer momento</li>
            </ul>
            <p className="mt-3">
              Para exercer qualquer desses direitos, entre em contato pelo email:{' '}
              <a href="mailto:privacidade@autoszap.com" className="text-blue-400 hover:underline">
                privacidade@autoszap.com
              </a>
            </p>
          </Section>

          <Section title="10. Tratamento de dados de menores">
            <p>
              A Plataforma nao e destinada a menores de 18 anos. Nao coletamos intencionalmente dados pessoais de menores. Caso tome conhecimento de que um menor forneceu dados pessoais, entre em contato conosco para que possamos tomar as providencias necessarias.
            </p>
          </Section>

          <Section title="11. Transferencia internacional de dados">
            <p>
              Os dados pessoais podem ser transferidos para servidores localizados fora do Brasil, especificamente para a Meta Platforms, Inc. (Estados Unidos) no contexto da integracao com a API do WhatsApp Business, e para o Google LLC e Meta Platforms, Inc. no contexto de autenticacao social. Essas transferencias sao realizadas com base em clausulas contratuais adequadas e em conformidade com o Capitulo V da LGPD.
            </p>
          </Section>

          <Section title="12. Alteracoes nesta politica">
            <p>
              Esta Politica de Privacidade pode ser atualizada periodicamente. Quando houver alteracoes relevantes, notificaremos os usuarios por meio da Plataforma ou por email. A data da ultima atualizacao sera sempre indicada no topo do documento.
            </p>
          </Section>

          <Section title="13. Contato e encarregado (DPO)">
            <p>
              Para duvidas, solicitacoes ou reclamacoes relacionadas a esta Politica de Privacidade ou ao tratamento de seus dados pessoais, entre em contato:
            </p>
            <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
              <p><strong className="text-white">AutosZap</strong></p>
              <p>Email: <a href="mailto:privacidade@autoszap.com" className="text-blue-400 hover:underline">privacidade@autoszap.com</a></p>
              <p>Website: <a href="https://autoszap.com" className="text-blue-400 hover:underline">autoszap.com</a></p>
            </div>
          </Section>
        </article>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-6">
        <div className="mx-auto max-w-4xl px-4 text-center text-xs text-white/30 sm:px-8">
          &copy; {new Date().getFullYear()} AutosZap. Todos os direitos reservados.
        </div>
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}
