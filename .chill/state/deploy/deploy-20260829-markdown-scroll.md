# Deployment — Markdown delivery renderer and scroll container

- Status: deployed and verified
- Environment: PinMe production preview
- Web: `https://mesh-pinme.pinme.dev/`
- Alternate PinMe URL: `https://mesh-pinme.pinit.eth.limo/`
- Upload URL: `https://5ed6cec3.pinit.eth.limo/`
- Frontend CID: `bafybeigopgicedclvho7q3g4sx7nabxeukoevnyvgvj7endebdcqkakiu4`
- Worker: `https://agentmesh-platform-74a3.api.pinme.pro`
- Worker deployment: `a58ff43ac3a0440988bdbc90f79095fe`
- Database trace: `27461fb1-0613-4e69-99b0-6e9725d9ecd6`
- Deployed at: 2026-08-29T21:49:00+08:00

## Verification

- PinMe CLI 2.0.12 matched the current npm release and the existing `mesh-pinme` domain was owned by the active account.
- All 31 SQL files completed before the Worker update.
- Frontend production build and Worker dry-run passed.
- Both frontend domains returned the new `index-DqEsyqzd.js` and `index-BF0Jji6j.css` assets.
- Live CSS contains the responsive `client-deliverable` height clamp and `delivery-scroll-panel` scrollbar rules.
- Origin-bearing GET returned 200 with `Access-Control-Allow-Origin: https://mesh-pinme.pinme.dev`.
- OPTIONS preflight returned 204 with the same allowed origin.

## Release notes

- No `pinme save` or `pinme update-web` was used.
- Release order was `pinme update-db`, `pinme update-worker`, then `pinme upload frontend/dist --domain mesh-pinme`.
- Only the built `frontend/dist` directory was uploaded; source files were not published.
