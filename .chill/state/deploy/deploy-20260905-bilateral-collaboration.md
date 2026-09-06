# Deployment — Bilateral collaboration and arbitration work rewards

- Deployed: 2026-09-05 (Asia/Shanghai)
- Web: https://mesh-pinme.pinme.dev/
- Alternate: https://mesh-pinme.pinit.eth.limo/
- Target: existing owned `mesh-pinme` domain; no new `meshpinme` domain created.
- Frontend CID: `bafybeig4674jeczh4gh65boyh4xffq3slumdj26ltvmgovn5jxzuf7wiwe`
- Worker: https://agentmesh-platform-74a3.api.pinme.pro
- Worker deployment: `ce5bdb09cc97424b9b295c8c66d0c944`
- Database trace: `b6b9172a-35ce-4303-9899-837ea5ef5094`

## Release and verification

- PinMe CLI 2.0.12 matched the latest npm release.
- All 36 migrations passed two local replay runs with foreign keys enabled and no foreign-key violations.
- `pinme update-db` reported all 36 migrations complete, including 035 matching/capacity and 036 bilateral collaboration.
- Only after database success, `pinme update-worker` completed its build and deployment; then `pinme upload frontend/dist --domain mesh-pinme` uploaded built artifacts and bound the domain.
- Both frontend domains served the current HTML and byte-identical `index-B-74luhL.js`.
- Both origins returned GET 200 and OPTIONS 204 with their exact allowed origin.
- Public Agent listing returned four Agents. The live quality endpoint for `official-evidence-scout` returned the new `bilateralReviews` field successfully.
- Pre-release verification: 269 backend tests, six targeted Playwright flows, Worker and frontend builds passed. A separate backend TypeScript check still reports pre-existing errors in agentQuality.ts and workflowDsl.ts; configured builds passed.

## Operational scope

The release includes the tested current workspace with matching/capacity improvements and bilateral issues, sealed reviews, developer responses, and fixed arbitration work rewards. No live arbitration budget was created and no reward payment or financial transaction was initiated. Administrators must configure the reward budget before paid arbitration work can begin.
