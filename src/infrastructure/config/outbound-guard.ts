/**
 * SSRF defence (SDD §11.2): the app only calls hosts fixed in configuration, never a URL that
 * a user or a payload controls. Every outbound adapter builds its URLs through a guard.
 */
export class OutboundNotAllowedError extends Error {
  constructor(readonly host: string) {
    super(`Outbound request to "${host}" is not allowed`);
    this.name = 'OutboundNotAllowedError';
  }
}

export interface OutboundGuard {
  /** Returns the parsed URL, or throws `OutboundNotAllowedError` when it is not on the list. */
  readonly check: (target: string | URL) => URL;
}

/** `allowedOrigins` are exact origins such as `https://holaflyers.atlassian.net`. */
export function createOutboundGuard(allowedOrigins: readonly string[]): OutboundGuard {
  const allowed = new Set(allowedOrigins.map((origin) => new URL(origin).origin));
  return {
    check(target) {
      const url = typeof target === 'string' ? safeParse(target) : target;
      // Exact origin match: scheme, host and port. Credentials in the URL are never accepted.
      if (url === null || !isAllowed(url, allowed)) {
        throw new OutboundNotAllowedError(url?.hostname ?? 'invalid-url');
      }
      return url;
    },
  };
}

function isAllowed(url: URL, allowed: ReadonlySet<string>): boolean {
  return url.username === '' && url.password === '' && allowed.has(url.origin);
}

function safeParse(value: string): URL | null {
  return URL.canParse(value) ? new URL(value) : null;
}
