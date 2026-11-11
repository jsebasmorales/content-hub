import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type {
  AuthFailure,
  ExternalIdentity,
  RedirectAuthProvider,
  RedirectCallback,
  RedirectStart,
} from '@application/ports/auth-provider';
import { err, ok, type Result } from '@shared/result';

// Outgoing calls go only to these fixed hosts (SDD §11.2, SSRF).
const AUTHORIZE_URL = 'https://auth.atlassian.com/authorize';
const TOKEN_URL = 'https://auth.atlassian.com/oauth/token';
const PROFILE_URL = 'https://api.atlassian.com/me';
const REQUEST_TIMEOUT_MS = 5_000;

export interface AtlassianConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

const tokenResponse = z.object({ access_token: z.string().min(1) });
const profileResponse = z.object({
  email: z.string().optional(),
  name: z.string().optional(),
});

/**
 * Atlassian OAuth 2.0 (3LO) login. Prepared but NOT active until the OAuth app exists and
 * AUTH_PROVIDER=atlassian is configured (SDD §17, pending item 2).
 * Scope is the minimum: read:me. State and PKCE protect the flow.
 * To verify at activation: that Atlassian honours the PKCE parameters for this app type.
 */
export class AtlassianAuthProvider implements RedirectAuthProvider {
  readonly kind = 'redirect' as const;

  constructor(
    private readonly config: AtlassianConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  begin(): RedirectStart {
    const state = randomBytes(24).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: this.config.clientId,
      scope: 'read:me',
      redirect_uri: this.config.redirectUri,
      state,
      response_type: 'code',
      prompt: 'login',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    return { authorizationUrl: url.toString(), state, codeVerifier };
  }

  async complete(input: RedirectCallback): Promise<Result<ExternalIdentity, AuthFailure>> {
    try {
      const accessToken = await this.exchangeCode(input);
      if (!accessToken) return err('provider-error');
      return await this.fetchIdentity(accessToken);
    } catch {
      return err('provider-error');
    }
  }

  private async exchangeCode(input: RedirectCallback): Promise<string | null> {
    const response = await this.fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code: input.code,
        redirect_uri: this.config.redirectUri,
        code_verifier: input.codeVerifier,
      }),
    });
    if (!response.ok) return null;
    const parsed = tokenResponse.safeParse(await response.json());
    return parsed.success ? parsed.data.access_token : null;
  }

  private async fetchIdentity(accessToken: string): Promise<Result<ExternalIdentity, AuthFailure>> {
    const response = await this.fetchFn(PROFILE_URL, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return err('provider-error');
    const parsed = profileResponse.safeParse(await response.json());
    if (!parsed.success) return err('provider-error');
    // Atlassian hides the email when the profile visibility says so: refuse (SDD §11.2).
    if (!parsed.data.email) return err('email-unavailable');
    return ok({ email: parsed.data.email, name: parsed.data.name ?? null });
  }
}
