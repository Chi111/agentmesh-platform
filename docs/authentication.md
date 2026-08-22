# Web2 / Web3 authentication

AgentMesh supports two compatible authentication paths:

- **Privy (recommended)**: email OTP, Sign-In with Ethereum, external wallets and an embedded Ethereum wallet for users without one. Google OAuth is optional and shown only when explicitly enabled in both Privy and the frontend build.
- **PinMe Identity fallback**: the existing email/password and Google flow remains active when the frontend has no Privy App ID.

Both paths end at the same Worker authorization boundary. D1 `auth_identities` maps provider subjects to one canonical `profiles` record, so the same verified email can keep one workspace across PinMe and Privy. A wallet is authoritative only when it appears in a signed Privy identity token that matches the verified access-token subject.

Verified email and wallet are reconciled together. If they already belong to different profiles, login fails with `409 IDENTITY_CONFLICT` instead of silently merging accounts. Wallet addresses are normalized and new duplicate profile links are rejected at the D1 boundary.

## Privy setup

1. Create an app in the Privy dashboard.
2. Enable `Email` and `Wallet` login methods. Add the production gateway/domain and local development origin to the allowed origins. If Google is required, enable it in Privy before enabling it in the frontend.
3. Enable Privy's setting that returns linked user data in signed identity tokens. Without it, login still works, but the Worker cannot securely link email and wallet accounts into the canonical profile.
4. Set these frontend build variables:

   ```dotenv
   VITE_PRIVY_APP_ID="<app-id>"
   VITE_PRIVY_CLIENT_ID="<client-id-if-your-app-has-one>"
   # Only after Google is enabled in the Privy dashboard:
   VITE_PRIVY_GOOGLE_ENABLED="true"
   ```

5. The AgentMesh PinMe deployment verifies tokens through Privy's public JWKS
   endpoint and caches the signing keys, so key rotation does not require a new
   deployment. Other deployments can override the public app ID or verification
   source through Worker runtime configuration:

   ```dotenv
   PRIVY_APP_ID="<same-app-id>"
   PRIVY_JWKS_URL="https://auth.privy.io/api/v1/apps/<app-id>/jwks.json"
   # Optional fallback when remote JWKS cannot be used:
   PRIVY_VERIFICATION_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
   ```

   For local development these overrides can live in `backend/.dev.vars`. Never
   add the Privy App Secret to the frontend or Worker source.

6. The project defaults Worker CORS to `https://agentmesh.pinit.eth.limo` plus local development origins. Override the browser origins in Worker runtime when deploying another domain:

   ```dotenv
   CORS_ORIGIN="http://localhost:5173,https://your-production-domain.example"
   ```

7. Rebuild and deploy with `pinme save`.

## Security boundary

- The frontend sends the short-lived Privy access token as `Authorization: Bearer <token>` and the independently signed identity token as `Privy-Id-Token`.
- The Worker verifies the ES256 signature, `iss=privy.io`, `aud=<PRIVY_APP_ID>`, expiry and `did:privy:*` subject before loading a platform profile.
- The identity token is accepted only when its signature, issuer, audience and subject all match the authenticated access token. Browser-provided email, display name and wallet fields never establish identity.
- An unverified JWT payload is used only to choose the matching token verifier, never to authorize a request.
- The verification key is a public key. A Privy app secret is not required by this implementation and must not be added to the frontend.
- Contract settlement also requires the authenticated canonical profile to contain the signed wallet address. Worker verification binds deposits, releases and dispute state transactions to the expected wallet, mission key, amount, asset, contract, confirmation count and payout commitment.
