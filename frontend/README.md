This frontend now runs on [vinext](https://github.com/cloudflare/vinext), which reimplements the Next.js API surface on top of Vite. The application code keeps the existing `app/`, `route.ts`, `proxy.ts` and `next/*` imports, but the default local and build workflow now uses `vinext` instead of `next`.

## Development

Start the vinext dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

If you need the previous Next.js runtime for comparison or rollback, it is still available:

```bash
npm run dev:next
```

## Build And Start

Build a local Node target with Nitro:

```bash
npm run build
npm run start
```

Generate a Vercel-targeted build explicitly:

```bash
npm run build:vercel
```

## Notes

- `NEXT_PUBLIC_*` variables remain supported by vinext and do not need to be renamed.
- Fonts are self-hosted through Fontsource, so production no longer depends on CDN loading from the framework font helper.
- `next/image` continues to work through vinext's compatibility layer, without Next.js image optimization.
- Local production builds generate `.output` for the Node server started by `npm run start`.
- Vercel builds generate `.vercel/output` through Nitro's Vercel preset, triggered by `npm run build:vercel`.
- Full verification is available through `npm run verify`.

## Vercel

- Root Directory: `frontend`
- Framework Preset: `Other`
- `vercel.json` already pins the build command to `npm run build:vercel`

## References

- [vinext README](https://github.com/cloudflare/vinext)
- [Cloudflare announcement](https://blog.cloudflare.com/vinext/)
- [Nitro deployment docs](https://v3.nitro.build/deploy)
