'use client';

import { useEffect, useState } from 'react';
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

function detectPlatformHint() {
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
  const [platformHint, setPlatformHint] = useState<string | null>(null);

  useEffect(() => {
    // Resolve platform only after mount to avoid server/client markup mismatch.
    setPlatformHint(detectPlatformHint());
  }, []);

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
    <Card className="w-full max-w-[420px] rounded-[20px] border-white/8 bg-[linear-gradient(180deg,rgba(7,20,38,0.95),rgba(4,14,28,0.98))] shadow-[0_14px_30px_rgba(2,10,22,0.3)] backdrop-blur-xl">
      <CardHeader className="p-4 pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Badge className="border-primary/20 bg-primary-soft px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-primary">
              Downloads
            </Badge>
            <CardTitle className="text-[12px] font-semibold leading-tight tracking-tight text-foreground/90">
              Android, Windows e macOS
            </CardTitle>
          </div>
          {platformHint ? (
            <Badge className="w-fit border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[10px] text-foreground/80">
              Recomendado para {mapPlatform(platformHint)}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 p-4 pt-0">
        {loading ? (
          <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3 text-xs text-muted-foreground">
            Carregando versoes disponiveis...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-danger/25 bg-danger/10 p-3 text-xs text-danger">
            {error}
          </div>
        ) : (
          <>
            <div className="grid gap-2">
              {artifacts.map((artifact) => (
                <div
                  key={artifact.id}
                  className={`rounded-xl border p-3 transition ${
                    artifact.platform === platformHint
                      ? 'border-primary/35 bg-primary-soft/60 shadow-[0_8px_24px_rgba(61,150,255,0.14)]'
                      : 'border-white/8 bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`shrink-0 rounded-lg p-1.5 ring-1 ${
                          artifact.platform === 'android'
                            ? 'bg-[linear-gradient(135deg,rgba(61,220,132,0.20),rgba(61,220,132,0.07))] text-green-400 ring-green-400/25'
                            : artifact.platform === 'windows'
                              ? 'bg-[linear-gradient(135deg,rgba(50,151,255,0.22),rgba(50,151,255,0.07))] text-primary ring-primary/25'
                              : 'bg-[linear-gradient(135deg,rgba(190,190,200,0.16),rgba(190,190,200,0.06))] text-foreground/70 ring-white/15'
                        }`}
                      >
                        {artifact.platform === 'android' ? (
                          <Smartphone className="h-4.5 w-4.5" />
                        ) : artifact.platform === 'windows' ? (
                          <Laptop2 className="h-4.5 w-4.5" />
                        ) : (
                          <Apple className="h-4.5 w-4.5" />
                        )}
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-foreground">{artifact.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          v{artifact.version} • {artifact.channel}
                        </p>
                      </div>
                    </div>
                    {artifact.platform === platformHint ? (
                      <Badge className="border-primary/20 bg-primary/12 px-2 py-0.5 text-[10px] text-primary">
                        Sua plataforma
                      </Badge>
                    ) : null}
                  </div>

                  {artifact.notes ? (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {artifact.notes}
                    </p>
                  ) : null}

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Button
                      asChild
                      size="sm"
                      className="h-8 rounded-lg px-3 text-[12px] font-medium"
                    >
                      <Link href={artifact.url} target="_blank">
                        <Download className="mr-1 h-3.5 w-3.5" />
                        Baixar
                      </Link>
                    </Button>
                    {artifact.qrCodeUrl ? (
                      <Button
                        asChild
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-[12px] font-medium text-foreground/75 hover:bg-white/[0.06]"
                      >
                        <Link href={artifact.qrCodeUrl} target="_blank">
                          <QrCode className="mr-1 h-3.5 w-3.5" />
                          QR Code
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {payload?.documentationUrl ? (
              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3 text-xs leading-5 text-muted-foreground">
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
