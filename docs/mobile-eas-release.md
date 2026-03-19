# Mobile Expo/EAS Release Playbook

Guia operacional para publicar builds e updates OTA do app `apps/mobile` em produção.

## Pré-requisitos

1. Autenticar no Expo:

```bash
cd apps/mobile
npx eas whoami
```

2. Confirmar projeto EAS:
- Owner: `nyc2029`
- Project ID: `5d77094b-aff1-40b2-a32d-e26649340953`
- Arquivo: `apps/mobile/app.config.ts`

3. Validar qualidade antes da publicação:

```bash
npm run lint --workspace @autoszap/mobile
npm exec --workspace @autoszap/mobile tsc -- --noEmit
npm run lint --workspace frontend
npm run build --workspace frontend
npm run typecheck --workspace backend
npm run test --workspace backend -- --runInBand
npm run build --workspace backend
```

## Estratégia de release

- Canais:
  - `preview` (homologação)
  - `production` (clientes finais)
- Configuração em `apps/mobile/eas.json`.
- `runtimeVersion` segue `policy: "appVersion"` em `apps/mobile/app.config.ts`.

### Regra de compatibilidade

- Mudança apenas JS/assets: publicar OTA com `eas update`.
- Mudança nativa (dependências nativas, permissões, plugins, runtime): gerar nova build com `eas build`.
- Sempre incrementar `APP_VERSION` quando houver mudança nativa para evitar update incompatível.

## Publicar build Android (produção)

```bash
cd apps/mobile
npx eas build --platform android --profile production --non-interactive
```

Saída esperada: URL de artefato `.apk` no Expo Dashboard.

## Publicar OTA em produção

```bash
cd apps/mobile
npx eas update --channel production --message "AutoZap mobile production update - <commit>" --non-interactive
```

Saída esperada: `Update group ID` e link do dashboard.

## Fluxo recomendado de publicação

1. Commit e push no GitHub.
2. Deploy Web (Vercel) e Backend (VPS) concluídos.
3. Build mobile de produção (`eas build`).
4. OTA de produção (`eas update`) se não houver mudança nativa.
5. Atualizar manifesto de releases (`deploy/platform-releases.json`) quando houver novo link público de download.

## Última execução validada

- Commit: `b485815`
- Build Android: `https://expo.dev/artifacts/eas/pJ9fVtgEubCmFiCnND7q3j.apk`
- OTA update group: `6f6d73cb-4475-41ed-ab3b-7ae0c3e5271c`
- Dashboard: `https://expo.dev/accounts/nyc2029/projects/autoszap-mobile/updates/6f6d73cb-4475-41ed-ab3b-7ae0c3e5271c`
