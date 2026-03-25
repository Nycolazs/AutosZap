import type { Metadata } from 'next';
import { HomeContent } from '@/components/marketing/home-content';

export const metadata: Metadata = {
  title: 'AutosZap — Plataforma Completa de Atendimento e CRM para WhatsApp',
  description:
    'Atendimento profissional pelo WhatsApp. Inbox multiatendente, CRM com pipeline, campanhas, automações e gestão de equipe — tudo em uma única plataforma.',
  alternates: { canonical: 'https://autoszap.com' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'AutosZap',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://autoszap.com',
  description:
    'Atendimento profissional pelo WhatsApp. Inbox multiatendente, CRM com pipeline, campanhas, automações e gestão de equipe — tudo em uma única plataforma.',
  offers: { '@type': 'Offer', category: 'SaaS' },
  featureList: [
    'Inbox multiatendente com distribuição de conversas',
    'CRM com pipeline para leads e oportunidades',
    'Campanhas e listas para operação comercial',
    'Automações para reduzir retrabalho no atendimento',
    'Gestão de equipe e perfis de acesso',
    'Indicadores de desempenho para decisão rápida',
  ],
};

export default function HomePage() {
  const currentYear = new Date().getFullYear();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeContent currentYear={currentYear} />
    </>
  );
}
