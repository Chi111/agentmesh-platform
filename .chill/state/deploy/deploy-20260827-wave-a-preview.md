# Wave A Preview Deployment

## Result

- Status: deployed
- Project: `agentmesh-platform-74a3`
- Worker deployment ID: `fbdd19fbd6cb4a438723abbe095c8a75`
- Worker URL: `https://agentmesh-platform-74a3.api.pinme.pro`
- Frontend URL: `https://agentmesh.pinit.eth.limo`
- Frontend CID: `bafybeiemwlu6yt3gtsd52yalctzpwda7u3czllj4xp23u35vuktvyycree`
- Previous frontend CID: `bafybeicutpgs5dnaf2kibjwakn4tzun6u4zcnqxtica26xlhhlh6w4kosq`
- Deployed at: `2026-08-27T18:55:49+08:00`

## Scope

- Existing PinMe frontend and Cloudflare Worker updated with `pinme save`.
- Additive D1 migrations `001` through `025` completed.
- No R2, Vectorize, Containers, contracts, testnet/mainnet transactions or funds were created or changed.
- Approval gate `platform-infrastructure-002` remains pending.

## Verification

- Pre-deploy backend tests: 151/151 passed.
- Full production build and Worker dry-run passed.
- Worker health returned HTTP 200 with database, authentication and LLM configuration healthy.
- Capabilities returned HTTP 200 and advertised the 5,000-row direct/async export boundary.
- Private export claim returned fail-closed `503 EXPORT_SERVICE_NOT_CONFIGURED`, as expected without the external data plane.
- PinMe upload history confirmed the new frontend CID, and the custom `eth.limo` gateway propagated to it at `2026-08-27T18:58:55+08:00`.
- The deployed entry JavaScript and stylesheet both returned HTTP 200 from the custom frontend domain.

## Rollback

- Frontend rollback anchor: `bafybeicutpgs5dnaf2kibjwakn4tzun6u4zcnqxtica26xlhhlh6w4kosq`.
- D1 changes are additive migrations; do not attempt destructive schema rollback.
