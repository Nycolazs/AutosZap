import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AutosZap — Atendimento, CRM e Automacao para WhatsApp Business',
    short_name: 'AutosZap',
    description:
      'Plataforma B2B que une inbox multiatendente, CRM com pipeline e automacao para WhatsApp Business Platform.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#3891ff',
    icons: [
      {
        src: '/brand/autoszap-mark.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
