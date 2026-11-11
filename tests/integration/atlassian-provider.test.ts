import { describe, expect, it } from 'vitest';
import { AtlassianAuthProvider } from '@infrastructure/auth/atlassian-provider';

const config = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://hub.example.com/auth/callback',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Fake of the network: answers the token call, then the profile call. */
function fakeFetch(profile: unknown, tokenStatus = 200): typeof fetch {
  return (input: Parameters<typeof fetch>[0]) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.includes('/oauth/token')) {
      return Promise.resolve(json({ access_token: 'tok' }, tokenStatus));
    }
    return Promise.resolve(json(profile));
  };
}

describe('AtlassianAuthProvider', () => {
  it('builds an authorization URL with state, PKCE and the minimal scope', () => {
    const start = new AtlassianAuthProvider(config).begin();
    const url = new URL(start.authorizationUrl);
    expect(url.origin).toBe('https://auth.atlassian.com');
    expect(url.searchParams.get('scope')).toBe('read:me');
    expect(url.searchParams.get('state')).toBe(start.state);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(start.codeVerifier.length).toBeGreaterThan(40);
  });

  it('returns the verified identity', async () => {
    const provider = new AtlassianAuthProvider(
      config,
      fakeFetch({ email: 'a@holafly.com', name: 'Ana' }),
    );
    expect(await provider.complete({ code: 'c', codeVerifier: 'v' })).toEqual({
      ok: true,
      value: { email: 'a@holafly.com', name: 'Ana' },
    });
  });

  it('refuses access when Atlassian does not return an email', async () => {
    const provider = new AtlassianAuthProvider(config, fakeFetch({ name: 'Ana' }));
    expect(await provider.complete({ code: 'c', codeVerifier: 'v' })).toEqual({
      ok: false,
      error: 'email-unavailable',
    });
  });

  it('fails closed when the token exchange fails', async () => {
    const provider = new AtlassianAuthProvider(config, fakeFetch({}, 400));
    expect(await provider.complete({ code: 'c', codeVerifier: 'v' })).toEqual({
      ok: false,
      error: 'provider-error',
    });
  });
});
