import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'AutosZap — Atendimento, CRM e Automacao para WhatsApp Business';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #0a0a0a 0%, #111827 50%, #0a0a0a 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #3891ff, #1698c4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px',
                fontWeight: 700,
                color: 'white',
              }}
            >
              A
            </div>
            <span
              style={{
                fontSize: '56px',
                fontWeight: 700,
                color: 'white',
                letterSpacing: '-2px',
              }}
            >
              AutosZap
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span
              style={{
                fontSize: '28px',
                fontWeight: 500,
                color: '#94a3b8',
                textAlign: 'center',
                maxWidth: '800px',
              }}
            >
              Atendimento, CRM e Automacao para
            </span>
            <span
              style={{
                fontSize: '32px',
                fontWeight: 600,
                color: '#3891ff',
                textAlign: 'center',
              }}
            >
              WhatsApp Business Platform
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '32px',
              marginTop: '16px',
            }}
          >
            {['Inbox Multiatendente', 'CRM com Pipeline', 'Automacoes'].map((item) => (
              <div
                key={item}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 20px',
                  borderRadius: '999px',
                  border: '1px solid rgba(56, 145, 255, 0.3)',
                  background: 'rgba(56, 145, 255, 0.1)',
                }}
              >
                <span style={{ color: '#3891ff', fontSize: '14px', fontWeight: 700 }}>OK</span>
                <span style={{ color: '#e2e8f0', fontSize: '18px', fontWeight: 500 }}>
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>

        <span
          style={{
            position: 'absolute',
            bottom: '24px',
            fontSize: '16px',
            color: '#475569',
          }}
        >
          autoszap.com
        </span>
      </div>
    ),
    { ...size },
  );
}
