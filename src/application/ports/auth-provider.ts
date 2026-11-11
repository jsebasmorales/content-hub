import type { Result } from '@shared/result';

/** Identity proven by an external provider. The email is the key to the invitation list. */
export interface ExternalIdentity {
  readonly email: string;
  readonly name: string | null;
}

export type AuthFailure = 'invalid-credentials' | 'email-unavailable' | 'provider-error';

/** Development provider: the user types an email, no external system involved. */
export interface DirectAuthProvider {
  readonly kind: 'direct';
  authenticate(email: string): Promise<Result<ExternalIdentity, AuthFailure>>;
}

export interface RedirectStart {
  readonly authorizationUrl: string;
  /** Random value sent to the provider and checked on return (CSRF protection). */
  readonly state: string;
  /** PKCE secret, kept in a short-lived cookie until the callback. */
  readonly codeVerifier: string;
}

export interface RedirectCallback {
  readonly code: string;
  readonly codeVerifier: string;
}

/** OAuth 2.0 authorization-code provider (Atlassian). */
export interface RedirectAuthProvider {
  readonly kind: 'redirect';
  begin(): RedirectStart;
  complete(input: RedirectCallback): Promise<Result<ExternalIdentity, AuthFailure>>;
}

/** The login mechanism behind the Hub. Swappable without touching the rest (SDD §2). */
export type AuthProvider = DirectAuthProvider | RedirectAuthProvider;
