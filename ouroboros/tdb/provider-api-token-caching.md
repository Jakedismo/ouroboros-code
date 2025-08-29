# API Token Caching for OpenAI and Anthropic

This document clarifies how to enable and handle API token caching for OpenAI and Anthropic providers in the multi‑LLM setup. It focuses on access/refresh tokens (credentials), not response/result caching.

## Goals

- Persist and reuse provider credentials across CLI sessions.
- Avoid unnecessary re‑auth round‑trips; refresh proactively before expiry.
- Keep token handling secure, auditable, and easy to clear or migrate.

## Current State in Repo

- Anthropic:
  - OAuth is already implemented via `EnhancedAnthropicOAuthManager` and `ClaudeTokenStorage`.
  - Tokens are saved to `~/.ouroboros-code/claude-oauth-tokens.json` (0600 perms) and loaded on startup; automatic refresh is supported.
  - Legacy and Python SDK token locations are detected and can be migrated.
  - Provider integrates this when `config.useOAuth === true` for Anthropic.

- OpenAI:
  - Uses `OPENAI_API_KEY` (API key) today; no OAuth flow is used in the codebase.
  - API keys are static secrets, not short‑lived tokens; no refresh required.
  - “Token caching” for OpenAI is effectively just client reuse keyed by API key/base URL.

## What “API Token Caching” Means Here

1) Anthropic (OAuth): persist `access_token`, `refresh_token`, and expiry metadata; auto‑refresh and save updated tokens; reuse across runs.
2) OpenAI (API key): reuse a single client instance per unique `{apiKey, baseUrl}`; do not persist API key to disk (read from env/config each run). If/when OpenAI OAuth is added, replicate Anthropic’s approach with a dedicated token storage file.

## Anthropic: Enabling and Using OAuth Token Caching

- Enable Claude OAuth in Config:
  - Set `claudeUseOauth: true` (or through `/auth claude login` flow in CLI).
  - Optional: pre‑seed `claudeAccessToken`, `claudeRefreshToken`, and `claudeCredentialsPath` to import/migrate.
- Provider Behavior:
  - `EnhancedAnthropicOAuthManager.initialize()` loads tokens via `ClaudeTokenStorage`.
  - If tokens exist and are near expiry, it refreshes automatically and writes updated tokens back to storage.
  - Calls to `getAccessToken()` always return a valid (refreshed if needed) `access_token`.
- Storage Details (already implemented):
  - Primary: `~/.ouroboros-code/claude-oauth-tokens.json` (0600 perms).
  - Read‑only fallback sources: `~/.claude_code/tokens.json`, `~/.claude/.credentials.json`.
  - Migration helper: `ClaudeTokenStorage.migrateTokens(fromPath)`.
- Clearing Credentials:
  - Use manager’s `clearTokens()` (or CLI `auth claude logout`) to remove from primary location.

### Security & Privacy

- Tokens stored on disk with 0600 permissions; no plain logging of token values.
- No secrets in cache keys or telemetry; redact when logging errors.
- Users can place the config dir on encrypted storage if needed.

## OpenAI: Key Handling and Reuse (No OAuth)

- Source of truth: `OPENAI_API_KEY` env var (or config override) at runtime.
- There is no short‑lived token to cache; the best practice is to avoid writing the API key to disk and to reuse the initialized SDK client.
- Provider/Factory Reuse:
  - `LLMProviderFactory` and provider instances should cache a single OpenAI SDK client per `{apiKey, baseUrl}` within the process lifetime.
  - This minimizes re‑instantiation overhead and ensures stable connection reuse.
- If OpenAI OAuth is added in the future:
  - Mirror Anthropic’s pattern with `OpenAIOAuthManager` + `OpenAITokenStorage` (0600 perms) and proactive refresh.

## Recommended UX (CLI)

- Anthropic:
  - `/auth claude login` → runs OAuth flow, saves tokens to primary storage.
  - `/auth claude status` → shows if authenticated, expiry, and storage locations.
  - `/auth claude logout` → clears primary tokens.
  - `/auth claude import --from <path>` → imports legacy/Python SDK tokens.

- OpenAI:
  - Users set `OPENAI_API_KEY`; no token file is written by the CLI.
  - `/auth openai status` (optional future) could verify presence of the env var and try a no‑op API call.

## Edge Cases & Behavior

- Multiple Accounts/Profiles:
  - Anthropic tokens are single‑profile by default. If multi‑profile is needed, parameterize the storage filename (e.g., `claude-oauth-tokens.<profile>.json`) and surface it via CLI `--profile`.
  - OpenAI uses whichever API key is present in the environment for the active shell/profile.

- Clock Skew:
  - The manager uses a 5‑minute buffer before expiry to refresh tokens, covering small clock skews.

- Network/Refresh Failures:
  - If refresh fails, the manager retries (bounded), then surfaces a clear error. The CLI should prompt the user to re‑authenticate.

## Implementation Summary (Already in Place)

- Anthropic
  - `EnhancedAnthropicOAuthManager` handles token persistence (`ClaudeTokenStorage`), auto‑refresh, migration, status, and clearing.
  - Provider uses the manager when `config.useOAuth === true`.

- OpenAI
  - API key only; use process‑lifetime client reuse. No disk token storage.

## Testing Plan

- Anthropic
  - Verify initial login writes token file with 0600 perms.
  - Validate auto‑refresh within 5‑minute buffer updates `expires_at` and persists tokens.
  - Confirm migration from legacy/Python SDK paths to primary.
  - Confirm logout clears the primary file.

- OpenAI
  - Confirm provider initialization reuses a client across calls.
  - Optionally add a health check test gated behind `OPENAI_API_KEY` presence.

---

Author: Provider credentials handling
Status: Clarified (leveraging existing Anthropic OAuth storage; OpenAI remains API‑key based)
Applies to: Anthropic OAuth tokens; OpenAI API key client reuse

