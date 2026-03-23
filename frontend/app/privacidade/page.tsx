import type { Metadata } from 'next';
import { PrivacidadeContent } from '@/components/marketing/privacidade-content';

export const metadata: Metadata = {
  title: 'Política de Privacidade — AutosZap',
  description:
    'Saiba como o AutosZap coleta, utiliza, armazena e protege seus dados pessoais em conformidade com a LGPD.',
  alternates: { canonical: 'https://autoszap.com/privacidade' },
};

export default function PrivacyPolicyPage() {
  return <PrivacidadeContent />;
}
