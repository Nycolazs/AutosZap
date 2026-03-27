import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export type GatewayConfig = {
  port: number;
  bindHost: string;
  internalSecret: string;
  callbackBaseUrl: string;
  sessionDir: string;
  registryFile: string;
  chromiumPath?: string;
  headless: boolean;
  callbackTimeoutMs: number;
  autoRestartDelayMs: number;
};

function readNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export async function loadGatewayConfig(): Promise<GatewayConfig> {
  const port = readNumber(process.env.PORT, 3001);
  const bindHost = process.env.BIND_HOST?.trim() || '0.0.0.0';
  const internalSecret = process.env.GATEWAY_SHARED_SECRET?.trim();
  const callbackBaseUrl = process.env.BACKEND_CALLBACK_BASE_URL?.trim();
  const sessionDir = process.env.SESSION_DIR?.trim() || '/data/sessions';
  const registryFile =
    process.env.REGISTRY_FILE?.trim() || path.join(sessionDir, 'registry.json');
  const chromiumPath = process.env.CHROMIUM_PATH?.trim() || undefined;
  const headless = readBoolean(process.env.HEADLESS, true);
  const callbackTimeoutMs = readNumber(
    process.env.CALLBACK_TIMEOUT_MS,
    10_000,
  );
  const autoRestartDelayMs = readNumber(
    process.env.AUTO_RESTART_DELAY_MS,
    5_000,
  );

  if (!internalSecret) {
    throw new Error('GATEWAY_SHARED_SECRET is required.');
  }

  if (!callbackBaseUrl) {
    throw new Error('BACKEND_CALLBACK_BASE_URL is required.');
  }

  if (!existsSync(sessionDir)) {
    await mkdir(sessionDir, { recursive: true });
  }

  const registryDir = path.dirname(registryFile);
  if (!existsSync(registryDir)) {
    await mkdir(registryDir, { recursive: true });
  }

  return {
    port,
    bindHost,
    internalSecret,
    callbackBaseUrl,
    sessionDir,
    registryFile,
    chromiumPath,
    headless,
    callbackTimeoutMs,
    autoRestartDelayMs,
  };
}
