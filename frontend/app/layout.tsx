import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: '--font-plus-jakarta',
  subsets: ['latin'],
});

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
});

const SITE_URL = 'https://autoszap.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'AutosZap — Plataforma Completa de Atendimento e CRM para WhatsApp',
    template: '%s | AutosZap',
  },
  description:
    'Atendimento profissional pelo WhatsApp. Inbox multiatendente, CRM com pipeline, campanhas, automacoes e gestao de equipe — tudo em uma unica plataforma.',
  keywords: [
    'whatsapp business',
    'whatsapp api',
    'crm whatsapp',
    'atendimento whatsapp',
    'inbox whatsapp',
    'automacao whatsapp',
    'whatsapp business platform',
    'multiatendimento whatsapp',
    'plataforma whatsapp',
    'autoszap',
  ],
  authors: [{ name: 'AutosZap', url: SITE_URL }],
  creator: 'AutosZap',
  publisher: 'AutosZap',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    url: SITE_URL,
    siteName: 'AutosZap',
    title: 'AutosZap — Plataforma Completa de Atendimento e CRM para WhatsApp',
    description:
      'Atendimento profissional pelo WhatsApp. Inbox multiatendente, CRM com pipeline, campanhas, automacoes e gestao de equipe — tudo em uma unica plataforma.',
    images: [
      {
        url: '/brand/autoszap-og.png',
        width: 1200,
        height: 630,
        alt: 'AutosZap — Plataforma Completa de Atendimento e CRM para WhatsApp',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AutosZap — Plataforma Completa de Atendimento e CRM para WhatsApp',
    description:
      'Atendimento profissional pelo WhatsApp. Inbox multiatendente, CRM com pipeline, campanhas, automacoes e gestao de equipe — tudo em uma unica plataforma.',
    images: ['/brand/autoszap-og.png'],
  },
  alternates: {
    canonical: SITE_URL,
  },
  icons: {
    icon: '/brand/autoszap-mark.png',
    shortcut: '/brand/autoszap-mark.png',
    apple: '/brand/autoszap-mark.png',
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${plusJakartaSans.variable} ${spaceGrotesk.variable} min-h-screen bg-background text-foreground antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
