'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Apple, Download, Laptop2, QrCode, Smartphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ReleaseArtifact = {
  id: string;
  platform: 'android' | 'windows' | 'macos';
  label: string;
  version: string;
  buildNumber: string;
  channel: string;
  url: string;
  fileSizeMb?: number | null;
  notes?: string | null;
  minimumOsVersion?: string | null;
  qrCodeUrl?: string | null;
  checksum?: string | null;
  updatedAt: string;
};

type ReleasesPayload = {
  generatedAt: string;
  supportEmail?: string | null;
  documentationUrl?: string | null;
  artifacts: ReleaseArtifact[];
  recommended?: ReleaseArtifact | null;
};

function getPlatformHint() {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes('android')) return 'android';
  if (userAgent.includes('mac os')) return 'macos';
  if (userAgent.includes('windows')) return 'windows';
  return null;
}

export function PlatformDownloads() {
  const [payload, setPayload] = useState<ReleasesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const platformHint = useMemo(getPlatformHint, []);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/api/proxy/platform/releases');
        const nextPayload = (await response.json()) as ReleasesPayload & {
          message?: string;
        };

        if (!response.ok) {
          setError(nextPayload.message ?? 'Nao foi possivel carregar os downloads agora.');
          return;
        }

        setPayload(nextPayload);
      } catch (nextError) {
        setError(
          nextError instanceof Error
            ? nextError.message
            : 'Nao foi possivel carregar os downloads agora.',
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const artifacts = payload?.artifacts ?? [];

  return (
    <Card className="w-full max-w-[440px] rounded-[28px] border-white/8 bg-[linear-gradient(180deg,rgba(7,20,38,0.94),rgba(4,16,31,0.98))] shadow-[0_18px_48px_rgba(2,10,22,0.28)] backdrop-blur-xl">
      <CardHeader className="p-5 pb-3 sm:p-6 sm:pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge className="border-primary/20 bg-primary-soft px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-primary">
              Downloads
            </Badge>
            <CardTitle className="mt-3 text-xl sm:text-[22px]">
              Apps para Android, Windows e macOS
            </CardTitle>
          </div>
          {platformHint ? (
            <Badge className="border-white/10 bg-white/[0.05] text-[11px] text-foreground/80">
              Recomendado para {mapPlatform(platformHint)}
            </Badge>
          ) : null}
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Instale a versao certa para vender com notificacoes, lembretes e inbox dedicado fora do navegador.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 p-5 pt-0 sm:p-6 sm:pt-0">
        {loading ? (
          <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4 text-sm text-muted-foreground">
            Carregando versoes disponiveis...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-danger/25 bg-danger/10 p-4 text-sm text-danger">
            {error}
          </div>
        ) : (
          <>
            <div className="grid gap-3">
              {artifacts.map((artifact) => (
                <div
                  key={artifact.id}
                  className={`rounded-[24px] border p-4 transition ${
                    artifact.platform === platformHint
                      ? 'border-primary/35 bg-primary-soft/60 shadow-[0_12px_32px_rgba(61,150,255,0.16)]'
                      : 'border-white/8 bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-2.5 text-primary">
                        {artifact.platform === 'android' ? (
                          <Smartphone className="h-4 w-4" />
                        ) : artifact.platform === 'windows' ? (
                          <Laptop2 className="h-4 w-4" />
                        ) : (
                          <Apple className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{artifact.label}</p>
                        <p className="text-xs text-muted-foreground">
                          v{artifact.version} • build {artifact.buildNumber} • {artifact.channel}
                        </p>
                      </div>
                    </div>
                    {artifact.platform === platformHint ? (
                      <Badge className="border-primary/20 bg-primary/12 text-[11px] text-primary">
                        Sua plataforma
                      </Badge>
                    ) : null}
                  </div>

                  {artifact.notes ? (
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {artifact.notes}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-2.5">
                    <Button
                      asChild
                      size="sm"
                      className="h-9 rounded-xl px-4 text-sm"
                    >
                      <Link href={artifact.url} target="_blank">
                        <Download className="mr-2 h-4 w-4" />
                        Baixar
                      </Link>
                    </Button>
                    {artifact.qrCodeUrl ? (
                      <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="h-9 rounded-xl border-white/10 bg-white/[0.03] px-4 text-sm text-foreground hover:bg-white/[0.05]"
                      >
                        <Link href={artifact.qrCodeUrl} target="_blank">
                          <QrCode className="mr-2 h-4 w-4" />
                          QR Code
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {payload?.documentationUrl ? (
              <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4 text-sm leading-6 text-muted-foreground">
                Precisa de ajuda para instalar?{' '}
                <Link
                  href={payload.documentationUrl}
                  target="_blank"
                  className="font-semibold text-primary"
                >
                  Ver instrucoes de instalacao
                </Link>
                {payload.supportEmail ? ` ou fale com ${payload.supportEmail}.` : '.'}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function mapPlatform(platform: string) {
  if (platform === 'android') return 'Android';
  if (platform === 'windows') return 'Windows';
  if (platform === 'macos') return 'macOS';
  return platform;
}
