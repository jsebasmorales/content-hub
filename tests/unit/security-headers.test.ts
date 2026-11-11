import { describe, expect, it } from 'vitest';
import { applySecurityHeaders } from '@presentation/security/security-headers';
import { notFoundResponse, tooManyRequestsResponse } from '@presentation/security/responses';

function headersAfterApplying(initial: Record<string, string> = {}): Headers {
  const headers = new Headers(initial);
  applySecurityHeaders(headers);
  return headers;
}

describe('applySecurityHeaders (SDD §11.2)', () => {
  const headers = headersAfterApplying();

  it('forbids framing and restricts forms, base and plugins', () => {
    const csp = headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('unsafe-inline');
  });

  it('sets HSTS for one year including subdomains', () => {
    expect(headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
  });

  it('sets the remaining mandatory headers', () => {
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(headers.get('Permissions-Policy')).toContain('camera=()');
  });

  it('never lets shared caches store responses by default', () => {
    expect(headers.get('Cache-Control')).toBe('private, no-store');
    expect(headers.get('Vary')).toBe('Cookie');
  });

  it('keeps a more specific Cache-Control chosen by the handler', () => {
    expect(
      headersAfterApplying({ 'Cache-Control': 'private, max-age=60' }).get('Cache-Control'),
    ).toBe('private, max-age=60');
  });
});

describe('uniform error responses', () => {
  it('answers 404 with no body for API paths', async () => {
    const response = notFoundResponse('/api/admin/users');
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });

  it('answers pages with the same 404 page whatever the path', async () => {
    const hidden = await notFoundResponse('/permisos').text();
    const missing = await notFoundResponse('/does-not-exist').text();
    expect(hidden).toBe(missing);
  });

  it('tells the client when to retry after rate limiting', () => {
    const response = tooManyRequestsResponse(12);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('12');
  });
});
