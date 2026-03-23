'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { ScrollReveal } from '@/components/marketing/scroll-reveal';

const lastUpdated = '21 de março de 2026';

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

export function PrivacidadeContent() {
  return (
    <motion.main
      className="min-h-dvh bg-[#060918] text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
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
        <motion.div
          className="mb-10 border-b border-white/[0.08] pb-8"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.p variants={itemVariants} className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-400">
            Documento legal
          </motion.p>
          <motion.h1 variants={itemVariants} className="mt-2 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Política de Privacidade
          </motion.h1>
          <motion.p variants={itemVariants} className="mt-3 text-sm text-white/50">
            Última atualização: {lastUpdated}
          </motion.p>
        </motion.div>

        {/* Content */}
        <article className="prose-policy space-y-8 text-[15px] leading-[1.8] text-white/70">
          <ScrollReveal>
            <Section title="1. Introdução">
              <p>
                A <strong className="text-white">AutosZap</strong> (&ldquo;nós&rdquo;, &ldquo;nosso&rdquo; ou &ldquo;Plataforma&rdquo;), inscrita no CNPJ sob o número 65.822.899/0001-73, com sede em R. Pero Coelho, 442 - Centro, Fortaleza - CE, é a controladora dos dados pessoais tratados por meio da plataforma disponível em{' '}
                <a href="https://autoszap.com" className="text-blue-400 hover:underline">autoszap.com</a>.
              </p>
              <p>
                Esta Política de Privacidade descreve como coletamos, utilizamos, armazenamos, compartilhamos e protegemos os dados pessoais dos usuários em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei n. 13.709/2018) e demais normas aplicáveis.
              </p>
              <p>
                Ao utilizar a Plataforma, você declara estar ciente e de acordo com as práticas descritas neste documento.
              </p>
            </Section>
          </ScrollReveal>

          <ScrollReveal delay={0.05}>
            <Section title="2. Dados pessoais coletados">
              <p>Coletamos os seguintes dados, conforme a finalidade e o contexto de uso:</p>

              <h4 className="mt-4 text-sm font-semibold text-white">2.1 Dados de cadastro e conta</h4>
              <ul className="ml-4 list-disc space-y-1">
                <li>Nome completo</li>
                <li>Endereço de e-mail</li>
                <li>Senha (armazenada de forma criptografada com hash bcrypt)</li>
                <li>Nome da empresa e segmento de atuação</li>
                <li>Cargo ou função na empresa</li>
                <li>Foto de perfil (opcional)</li>
              </ul>

              <h4 className="mt-4 text-sm font-semibold text-white">2.2 Dados de uso e acesso</h4>
              <ul className="ml-4 list-disc space-y-1">
                <li>Endereço IP</li>
                <li>Identificador do navegador (User-Agent)</li>
                <li>Data e horário de acesso</li>
                <li>Registros de atividade (logs de auditoria)</li>
              </ul>

              <h4 className="mt-4 text-sm font-semibold text-white">2.3 Dados de contatos e conversas</h4>
              <ul className="ml-4 list-disc space-y-1">
                <li>Nome e número de telefone dos contatos cadastrados pelo usuário</li>
                <li>Conteúdo das mensagens enviadas e recebidas via WhatsApp</li>
                <li>Status de entrega das mensagens (enviado, entregue, lido)</li>
                <li>Notas internas criadas pela equipe sobre conversas</li>
                <li>Tags e segmentações atribuídas aos contatos</li>
              </ul>

              <h4 className="mt-4 text-sm font-semibold text-white">2.4 Dados de campanhas</h4>
              <ul className="ml-4 list-disc space-y-1">
                <li>Nome e conteúdo de campanhas de mensagens</li>
                <li>Listas de destinatários</li>
                <li>Arquivos de mídia anexados (imagens)</li>
                <li>Métricas de envio, entrega e leitura</li>
              </ul>

              <h4 className="mt-4 text-sm font-semibold text-white">2.5 Dados coletados via formulário de interesse</h4>
              <ul className="ml-4 list-disc space-y-1">
                <li>Nome, e-mail e telefone</li>
                <li>Nome da empresa e quantidade estimada de atendentes</li>
                <li>Observações adicionais</li>
              </ul>

              <h4 className="mt-4 text-sm font-semibold text-white">2.6 Dados de login social</h4>
              <p>
                Ao utilizar login via Google ou Facebook, coletamos seu nome e e-mail do provedor para criar ou autenticar sua conta. Não temos acesso às senhas dessas contas.
              </p>
            </Section>
          </ScrollReveal>

          <ScrollReveal delay={0.05}>
            <Section title="3. Finalidades do tratamento">
              <p>Os dados pessoais são tratados para as seguintes finalidades:</p>
              <ul className="ml-4 list-disc space-y-1">
                <li>Criar e manter sua conta na Plataforma</li>
                <li>Autenticar o acesso via credenciais ou login social (Google, Facebook)</li>
                <li>Permitir o envio e recebimento de mensagens via API oficial do WhatsApp Business</li>
                <li>Gerir contatos, conversas, CRM e campanhas de comunicação</li>
                <li>Administrar equipes, papéis e permissões de acesso</li>
                <li>Gerar códigos de convite para novos membros da equipe</li>
                <li>Manter registros de auditoria para segurança e conformidade</li>
                <li>Prevenir fraudes e abusos por meio de limitação de requisições (rate limiting)</li>
                <li>Responder a solicitações de contato e interesse comercial</li>
                <li>Cumprir obrigações legais e regulatórias</li>
              </ul>
            </Section>
          </ScrollReveal>

          <ScrollReveal delay={0.05}>
            <Section title="4. Base legal para o tratamento">
              <p>O tratamento dos dados pessoais é fundamentado nas seguintes bases legais previstas na LGPD:</p>
              <ul className="ml-4 list-disc space-y-1">
                <li><strong className="text-white">Consentimento</strong> (Art. 7º, I): para coleta de dados via formulário de interesse e aceite dos termos durante o cadastro</li>
                <li><strong className="text-white">Execução de contrato</strong> (Art. 7º, V): para prestação dos serviços contratados na Plataforma</li>
                <li><strong className="text-white">Legítimo interesse</strong> (Art. 7º, IX): para segurança da Plataforma, prevenção de fraudes e melhoria do serviço</li>
                <li><strong className="text-white">Cumprimento de obrigação legal</strong> (Art. 7º, II): para atender determinações legais e regulatórias</li>
              </ul>
            </Section>
          </ScrollReveal>

          <ScrollReveal delay={0.05}>
            <Section title="5. Compartilhamento de dados">
              <p>Os dados pessoais podem ser compartilhados com:</p>
              <ul className="ml-4 list-disc space-y-1">
                <li>
                  <strong className="text-white">Meta Platforms, Inc.</strong> — compartilhamos números de telefone dos contatos, conteúdo de mensagens e mídias enviadas pelo usuário por meio da API oficial do WhatsApp Business Platform, conforme necessário para a operação do serviço de mensageria
                </li>
                <li>
                  <strong className="text-white">Google LLC</strong> — ao utilizar login social com Google, seu e-mail e nome são verificados por meio da API Google OAuth 2.0
                </li>
                <li>
                  <strong className="text-white">Meta Platforms, Inc. (Facebook Login)</strong> — ao utilizar login social com Facebook, seu e-mail e nome são verificados por meio do Facebook SDK
                </li>
              </ul>
              <p className="mt-3">
                <strong className="text-white">Não vendemos, comercializamos ou compartilhamos dados pessoais com terceiros para fins de marketing ou publicidade.</strong>
              </p>
            </Section>
          </ScrollReveal>

          <ScrollReveal delay={0.05}>
            <Section title="6. Armazenamento e segurança">
              <p>Adotamos medidas técnicas e organizacionais para proteger os dados pessoais:</p>
              <ul className="ml-4 list-disc space-y-1">
                <li><strong className="text-white">Isolamento de dados</strong>: cada empresa possui banco de dados dedicado e independente, impossibilitando o acesso cruzado entre clientes</li>
                <li><strong className="text-white">Criptografia de credenciais</strong>: tokens de acesso ao WhatsApp e chaves sensíveis são criptografados com AES-256-CBC</li>
                <li><strong className="text-white">Hash de senhas</strong>: senhas são armazenadas com hash bcrypt (10 rounds), nunca em texto plano</li>
                <li><strong className="text-white">Cookies seguros</strong>: utilizamos cookies httpOnly, Secure e SameSite para autenticação, inacessíveis ao JavaScript do navegador</li>
                <li><strong className="text-white">HTTPS</strong>: todas as comunicações em produção são realizadas por conexão criptografada TLS/SSL</li>
                <li><strong className="text-white">Rate limiting</strong>: limitação de tentativas de login e cadastro para prevenir ataques de força bruta</li>
                <li><strong className="text-white">Auditoria</strong>: registros detalhados de ações realizadas na Plataforma para rastreabilidade</li>
              </ul>
            </Section>
          </ScrollReveal>

          <ScrollReveal delay={0.05}>
            <Section title="7. Cookies utilizados">
              <p>A Plataforma utiliza os seguintes cookies estritamente necessários para funcionamento:</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-white">
                      <th className="pb-2 pr-4 font-semibold">Cookie</th>
                      <th className="pb-2 pr-4 font-semibold">Finalidade</th>
                      <th className="pb-2 font-semibold">Duração</th>
                    </tr>
                  </thead>
                  <tbody className="text-white/60">
                    <tr className="border-b border-white/[0.05]">
                      <td className="py-2 pr-4 font-mono text-xs">autoszap_access_token</td>
                      <td className="py-2 pr-4">Autenticação da sessão ativa</td>
                      <td className="py-2">15 minutos</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-mono text-xs">autoszap_refresh_token</td>
                      <td className="py-2 pr-4">Renovação automática da sessão</td>
                      <td className="py-2">7 dias</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3">
                Não utilizamos cookies de rastreamento, publicidade ou analytics de terceiros.
              </p>
            </Section>
          </ScrollReveal>

          <ScrollReveal delay={0.05}>
            <Section title="8. Retenção de dados">
              <p>Os dados pessoais são retidos enquanto:</p>
              <ul className="ml-4 list-disc space-y-1">
                <li>A conta do usuário estiver ativa na Plataforma</li>
                <li>Houver necessidade de cumprimento de obrigações legais ou regulatórias</li>
                <li>For necessário para o exercício regular de direitos em processos judiciais ou administrativos</li>
              </ul>
              <p className="mt-3">
                Dados excluídos são inicialmente marcados como inativos (exclusão lógica) e podem ser removidos definitivamente após o período de retenção aplicável.
              </p>
            </Section>
          </ScrollReveal>

          <ScrollReveal delay={0.05}>
            <Section title="9. Direitos do titular">
              <p>
                Em conformidade com a LGPD, você tem os seguintes direitos em relação aos seus dados pessoais:
              </p>
              <ul className="ml-4 list-disc space-y-1">
                <li>Confirmar a existência de tratamento de dados</li>
                <li>Acessar seus dados pessoais</li>
                <li>Corrigir dados incompletos, inexatos ou desatualizados</li>
                <li>Solicitar a anonimização, bloqueio ou eliminação de dados desnecessários</li>
                <li>Solicitar a portabilidade dos dados</li>
                <li>Obter informação sobre o compartilhamento de dados</li>
                <li>Revogar o consentimento a qualquer momento</li>
              </ul>
              <p className="mt-3">
                Para exercer qualquer desses direitos, entre em contato pelo e-mail:{' '}
                <a href="mailto:suporte@autoszap.com" className="text-blue-400 hover:underline">
                  suporte@autoszap.com
                </a>
              </p>
            </Section>
          </ScrollReveal>

          <ScrollReveal delay={0.05}>
            <Section title="10. Tratamento de dados de menores">
              <p>
                A Plataforma não é destinada a menores de 18 anos. Não coletamos intencionalmente dados pessoais de menores. Caso tome conhecimento de que um menor forneceu dados pessoais, entre em contato conosco para que possamos tomar as providências necessárias.
              </p>
            </Section>
          </ScrollReveal>

          <ScrollReveal delay={0.05}>
            <Section title="11. Transferência internacional de dados">
              <p>
                Os dados pessoais podem ser transferidos para servidores localizados fora do Brasil, especificamente para a Meta Platforms, Inc. (Estados Unidos) no contexto da integração com a API do WhatsApp Business, e para o Google LLC e Meta Platforms, Inc. no contexto de autenticação social. Essas transferências são realizadas com base em cláusulas contratuais adequadas e em conformidade com o Capítulo V da LGPD.
              </p>
            </Section>
          </ScrollReveal>

          <ScrollReveal delay={0.05}>
            <Section title="12. Alterações nesta política">
              <p>
                Esta Política de Privacidade pode ser atualizada periodicamente. Quando houver alterações relevantes, notificaremos os usuários por meio da Plataforma ou por email. A data da última atualização será sempre indicada no topo do documento.
              </p>
            </Section>
          </ScrollReveal>

          <ScrollReveal delay={0.05}>
            <Section title="13. Contato e encarregado (DPO)">
              <p>
                Para dúvidas, solicitações ou reclamações relacionadas a esta Política de Privacidade ou ao tratamento de seus dados pessoais, entre em contato:
              </p>
              <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
                <p><strong className="text-white">AutosZap</strong></p>
                <p>Email: <a href="mailto:suporte@autoszap.com" className="text-blue-400 hover:underline">suporte@autoszap.com</a></p>
                <p>Website: <a href="https://autoszap.com" className="text-blue-400 hover:underline">autoszap.com</a></p>
              </div>
            </Section>
          </ScrollReveal>
        </article>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-6">
        <div className="mx-auto max-w-4xl px-4 text-center text-xs text-white/30 sm:px-8">
          &copy; {new Date().getFullYear()} AutosZap. Todos os direitos reservados.
        </div>
      </footer>
    </motion.main>
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
