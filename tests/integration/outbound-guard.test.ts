import { describe, expect, it } from 'vitest';
import {
  createOutboundGuard,
  OutboundNotAllowedError,
} from '@infrastructure/config/outbound-guard';

const guard = createOutboundGuard(['https://example.atlassian.net']);

describe('outbound guard', () => {
  it('accepts the configured origin and returns the parsed URL', () => {
    const url = guard.check('https://example.atlassian.net/rest/api/3/myself');
    expect(url.pathname).toBe('/rest/api/3/myself');
  });

  it.each([
    'https://evil.example.com/rest/api/3/myself',
    'http://example.atlassian.net/rest/api/3/myself',
    'https://example.atlassian.net.evil.com/',
    'https://example.atlassian.net:8443/',
    'https://user:pass@example.atlassian.net/',
    'https://example.atlassian.net@evil.com/',
    'not a url',
    '//example.atlassian.net/',
  ])('rejects %s', (target) => {
    expect(() => guard.check(target)).toThrow(OutboundNotAllowedError);
  });

  it('rejects everything when nothing is allowed', () => {
    expect(() => createOutboundGuard([]).check('https://example.atlassian.net/')).toThrow(
      OutboundNotAllowedError,
    );
  });
});
