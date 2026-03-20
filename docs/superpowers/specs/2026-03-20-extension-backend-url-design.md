# Extension backend URL design

## Goal
Update the Chrome extension to use `https://api.desmos-daily.alexcoders.com` as its backend base URL, while keeping the URL hardcoded in a single runtime constant wherever possible.

## Scope
- Update the extension popup fetch logic to use the new backend base URL.
- Replace the old `sslip.io` host permission in the extension manifest with the new HTTPS domain.
- Remove active runtime usage of the old backend URL.

## Approach
1. Add a top-level hardcoded `API_BASE_URL` constant in `packages/extension/src/popup/main.ts`.
2. Build the challenge endpoint URL from that constant in `loadChallenge()`.
3. Update `packages/extension/manifest.json` host permissions to `https://api.desmos-daily.alexcoders.com/*`.

## Constraints
- Do not introduce environment variables or build-time config.
- Do not add fallback URL behavior.
- Keep the change limited to the extension.
- The manifest remains static JSON, so the hostname must still appear there separately.

## Expected behavior
- The popup fetches today’s challenge from `https://api.desmos-daily.alexcoders.com/api/challenges/today`.
- The extension manifest allows requests to that host.
- The old `sslip.io` URL is removed from active extension code.

## Verification
- Build the extension successfully.
- Confirm the popup code uses the new constant-based backend URL.
- Confirm the manifest host permission matches the new HTTPS domain.
