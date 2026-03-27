import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { loadGatewayConfig } from "./config";
import { RegistryStore } from "./registry";
import {
  constantTimeEquals,
  deriveInstanceSecret,
  signPayload,
} from "./security";
import type {
  GatewayCallbackEnvelope,
  InstanceMediaSendRequest,
  InstanceRegistryEntry,
  InstanceTextSendRequest,
  RegisterInstanceRequest,
} from "./types";
import { WhatsAppSession } from "./whatsapp-session";

type ManagedSession = {
  registry: InstanceRegistryEntry;
  session: WhatsAppSession;
};

async function main() {
  const config = await loadGatewayConfig();
  const registry = new RegistryStore(config.registryFile);
  const sessions = new Map<string, ManagedSession>();
  const app = express();

  await registry.ensureDirectory();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "50mb" }));

  app.use((req, res, next) => {
    if (req.path === "/health" || req.path === "/healthz") {
      return next();
    }

    const provided = req.header("x-autoszap-internal-secret");
    if (!provided || !constantTimeEquals(provided, config.internalSecret)) {
      return res.status(401).json({
        message: "Unauthorized internal request.",
      });
    }

    return next();
  });

  const callbackTransport = {
    async send(instanceId: string, event: GatewayCallbackEnvelope) {
      const state = sessions.get(instanceId);
      const callbackUrl =
        state?.registry.callbackUrl ??
        `${config.callbackBaseUrl.replace(/\/+$/, "")}/api/internal/whatsapp-web/events`;
      const body = JSON.stringify(event);
      const secret = deriveInstanceSecret(config.internalSecret, instanceId);
      const timestamp = event.timestamp;
      const signature = signPayload(`${timestamp}.${body}`, secret);

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        config.callbackTimeoutMs,
      );

      try {
        const response = await fetch(callbackUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-autoszap-instance-id": instanceId,
            "x-autoszap-event-name": event.event,
            "x-autoszap-event-timestamp": timestamp,
            "x-autoszap-event-signature": signature,
          },
          body,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Backend callback failed with status ${response.status}.`,
          );
        }
      } finally {
        clearTimeout(timeout);
      }
    },
  };

  const bootstrapRegistry = await registry.load();
  for (const entry of bootstrapRegistry) {
    const managed = {
      registry: entry,
      session: new WhatsAppSession({
        instanceId: entry.instanceId,
        sessionDir: config.sessionDir,
        callbackSecret: deriveInstanceSecret(
          config.internalSecret,
          entry.instanceId,
        ),
        callbackTransport,
        chromiumPath: config.chromiumPath,
        headless: config.headless,
        autoRestartDelayMs: config.autoRestartDelayMs,
      }),
    } satisfies ManagedSession;

    sessions.set(entry.instanceId, managed);
  }

  await Promise.allSettled(
    bootstrapRegistry
      .filter((entry) => entry.autoStart)
      .map(async (entry) => {
        const managed = sessions.get(entry.instanceId);
        if (!managed) {
          return;
        }

        try {
          await managed.session.start({ recoverCorruptedSession: true });
        } catch (error) {
          console.error(
            `Failed to auto-start instance ${entry.instanceId}:`,
            error,
          );
        }
      }),
  );

  async function persistRegistry() {
    await registry.save(
      Array.from(sessions.values()).map((item) => item.registry),
    );
  }

  async function upsertSession(entry: RegisterInstanceRequest) {
    const now = new Date().toISOString();
    const existing = sessions.get(entry.instanceId);
    const registryEntry: InstanceRegistryEntry = {
      instanceId: entry.instanceId,
      callbackUrl:
        entry.callbackUrl?.trim() ||
        `${config.callbackBaseUrl.replace(/\/+$/, "")}/api/internal/whatsapp-web/events`,
      autoStart: entry.autoStart ?? true,
      createdAt: existing?.registry.createdAt ?? now,
      updatedAt: now,
      metadata: entry.metadata,
    };

    const managed =
      existing ??
      ({
        registry: registryEntry,
        session: new WhatsAppSession({
          instanceId: entry.instanceId,
          sessionDir: config.sessionDir,
          callbackSecret: deriveInstanceSecret(
            config.internalSecret,
            entry.instanceId,
          ),
          callbackTransport,
          chromiumPath: config.chromiumPath,
          headless: config.headless,
          autoRestartDelayMs: config.autoRestartDelayMs,
        }),
      } satisfies ManagedSession);

    managed.registry = registryEntry;
    sessions.set(entry.instanceId, managed);
    await persistRegistry();

    if (registryEntry.autoStart) {
      await managed.session.start({ recoverCorruptedSession: true });
    } else if (existing && managed.session.getState().status !== "stopped") {
      await managed.session.disconnect();
    }

    return managed;
  }

  app.get("/health", async (_req, res) => {
    const states = Array.from(sessions.values()).map((item) =>
      item.session.getState(),
    );
    res.json({
      ok: true,
      service: "whatsapp-web-gateway",
      uptimeSeconds: Math.floor(process.uptime()),
      instances: {
        total: states.length,
        connected: states.filter((state) => state.status === "connected")
          .length,
        authenticated: states.filter(
          (state) => state.status === "authenticated",
        ).length,
        qr: states.filter((state) => state.status === "qr").length,
        error: states.filter((state) => state.status === "error").length,
      },
    });
  });

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/instances", (_req, res) => {
    res.json(
      Array.from(sessions.values()).map((item) => ({
        ...item.registry,
        state: item.session.getState(),
      })),
    );
  });

  app.post("/instances", async (req, res, next) => {
    try {
      const body = req.body as Partial<RegisterInstanceRequest>;
      if (!body.instanceId?.trim()) {
        return res.status(400).json({ message: "instanceId is required." });
      }

      const managed = await upsertSession({
        instanceId: body.instanceId.trim(),
        callbackUrl: body.callbackUrl,
        autoStart: body.autoStart,
        metadata: body.metadata,
      });

      return res.status(201).json({
        ...managed.registry,
        state: managed.session.getState(),
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/instances/:instanceId", (req, res) => {
    const managed = sessions.get(req.params.instanceId);
    if (!managed) {
      return res.status(404).json({ message: "Instance not registered." });
    }
    return res.json({
      ...managed.registry,
      state: managed.session.getState(),
    });
  });

  app.get("/instances/:instanceId/state", (req, res) => {
    const managed = sessions.get(req.params.instanceId);
    if (!managed) {
      return res.status(404).json({ message: "Instance not registered." });
    }
    return res.json(managed.session.getState());
  });

  app.get("/instances/:instanceId/connection-state", (req, res) => {
    const managed = sessions.get(req.params.instanceId);
    if (!managed) {
      return res.status(404).json({ message: "Instance not registered." });
    }
    return res.json(managed.session.getState());
  });

  app.get("/instances/:instanceId/qr", (req, res) => {
    const managed = sessions.get(req.params.instanceId);
    if (!managed) {
      return res.status(404).json({ message: "Instance not registered." });
    }
    const state = managed.session.getState();
    return res.json({
      instanceId: state.instanceId,
      qr: state.qr,
      qrDataUrl: state.qrDataUrl,
      qrExpiresAt: state.qrExpiresAt,
      status: state.status,
    });
  });

  app.post("/instances/:instanceId/start", async (req, res, next) => {
    try {
      const managed = sessions.get(req.params.instanceId);
      if (!managed) {
        return res.status(404).json({ message: "Instance not registered." });
      }
      await managed.session.start({ recoverCorruptedSession: true });
      managed.registry.autoStart = true;
      managed.registry.updatedAt = new Date().toISOString();
      await persistRegistry();
      return res.json(managed.session.getState());
    } catch (error) {
      return next(error);
    }
  });

  app.post("/instances/:instanceId/connect", async (req, res, next) => {
    try {
      const managed = sessions.get(req.params.instanceId);
      if (!managed) {
        return res.status(404).json({ message: "Instance not registered." });
      }
      await managed.session.start({ recoverCorruptedSession: true });
      managed.registry.autoStart = true;
      managed.registry.updatedAt = new Date().toISOString();
      await persistRegistry();
      return res.json(managed.session.getState());
    } catch (error) {
      return next(error);
    }
  });

  app.post("/instances/:instanceId/reconnect", async (req, res, next) => {
    try {
      const managed = sessions.get(req.params.instanceId);
      if (!managed) {
        return res.status(404).json({ message: "Instance not registered." });
      }
      await managed.session.reconnect({ recoverCorruptedSession: true });
      managed.registry.autoStart = true;
      managed.registry.updatedAt = new Date().toISOString();
      await persistRegistry();
      return res.json(managed.session.getState());
    } catch (error) {
      return next(error);
    }
  });

  app.post("/instances/:instanceId/qr/refresh", async (req, res, next) => {
    try {
      const managed = sessions.get(req.params.instanceId);
      if (!managed) {
        return res.status(404).json({ message: "Instance not registered." });
      }
      await managed.session.refreshQr({ recoverCorruptedSession: true });
      return res.json(managed.session.getState());
    } catch (error) {
      return next(error);
    }
  });

  app.post("/instances/:instanceId/disconnect", async (req, res, next) => {
    try {
      const managed = sessions.get(req.params.instanceId);
      if (!managed) {
        return res.status(404).json({ message: "Instance not registered." });
      }
      await managed.session.disconnect();
      managed.registry.autoStart = false;
      managed.registry.updatedAt = new Date().toISOString();
      await persistRegistry();
      return res.json(managed.session.getState());
    } catch (error) {
      return next(error);
    }
  });

  app.post("/instances/:instanceId/history/sync", async (req, res, next) => {
    try {
      const managed = sessions.get(req.params.instanceId);
      if (!managed) {
        return res.status(404).json({ message: "Instance not registered." });
      }

      const result = await managed.session.syncHistory();
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.post("/instances/:instanceId/logout", async (req, res, next) => {
    try {
      const managed = sessions.get(req.params.instanceId);
      if (!managed) {
        return res.status(404).json({ message: "Instance not registered." });
      }
      await managed.session.logout();
      managed.registry.autoStart = false;
      managed.registry.updatedAt = new Date().toISOString();
      await persistRegistry();
      return res.json(managed.session.getState());
    } catch (error) {
      return next(error);
    }
  });

  app.post("/instances/:instanceId/unregister", async (req, res, next) => {
    try {
      const managed = sessions.get(req.params.instanceId);
      if (!managed) {
        return res.json({
          success: true,
          instanceId: req.params.instanceId,
        });
      }

      await managed.session.logout();
      sessions.delete(req.params.instanceId);
      await persistRegistry();

      return res.json({
        success: true,
        instanceId: req.params.instanceId,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/instances/:instanceId/send/text", async (req, res, next) => {
    try {
      const managed = sessions.get(req.params.instanceId);
      if (!managed) {
        return res.status(404).json({ message: "Instance not registered." });
      }

      const body = req.body as Partial<InstanceTextSendRequest>;
      if (!body.to?.trim() || !body.body?.trim()) {
        return res.status(400).json({ message: "to and body are required." });
      }

      const result = await managed.session.sendText({
        to: body.to.trim(),
        body: body.body,
        quotedMessageId: body.quotedMessageId?.trim() || undefined,
      });

      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.post("/instances/:instanceId/send/media", async (req, res, next) => {
    try {
      const managed = sessions.get(req.params.instanceId);
      if (!managed) {
        return res.status(404).json({ message: "Instance not registered." });
      }

      const body = req.body as Partial<InstanceMediaSendRequest>;
      if (
        !body.to?.trim() ||
        !body.dataBase64?.trim() ||
        !body.mimeType?.trim() ||
        !body.fileName?.trim()
      ) {
        return res.status(400).json({
          message: "to, dataBase64, mimeType and fileName are required.",
        });
      }

      const result = await managed.session.sendMedia({
        to: body.to.trim(),
        dataBase64: body.dataBase64,
        mimeType: body.mimeType,
        fileName: body.fileName,
        caption: body.caption,
        voice: body.voice === true,
        quotedMessageId: body.quotedMessageId?.trim() || undefined,
        sendMediaAsDocument: body.sendMediaAsDocument ?? false,
      });

      return res.json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.get("/instances/:instanceId/messages/:messageId/media", async (req, res, next) => {
    try {
      const managed = sessions.get(req.params.instanceId);
      if (!managed) {
        return res.status(404).json({ message: "Instance not registered." });
      }

      const media = await managed.session.downloadMessageMedia(
        req.params.messageId,
      );

      res.setHeader(
        "Content-Type",
        media.mimeType?.trim() || "application/octet-stream",
      );

      if (media.contentLength && Number.isFinite(media.contentLength)) {
        res.setHeader("Content-Length", String(media.contentLength));
      }

      if (media.fileName?.trim()) {
        const safeFileName = media.fileName.replace(/["\\\r\n]/g, "_");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${safeFileName}"`,
        );
      }

      return res.send(media.buffer);
    } catch (error) {
      return next(error);
    }
  });

  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const message =
        error instanceof Error ? error.message : "Unexpected gateway error.";
      res.status(500).json({ message });
    },
  );

  const server = app.listen(config.port, config.bindHost, () => {
    console.log(
      `WhatsApp Web gateway listening on http://${config.bindHost}:${config.port}`,
    );
  });

  async function shutdown(signal: string) {
    console.log(`Received ${signal}, shutting down gateway.`);
    server.close(() => {
      void Promise.allSettled(
        Array.from(sessions.values()).map((item) => item.session.destroy()),
      ).finally(() => process.exit(0));
    });
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
