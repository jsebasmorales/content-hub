import type { DirectAuthProvider } from '@application/ports/auth-provider';
import { err, ok } from '@shared/result';

/**
 * Development-only login: trusts the email typed in. It only exists when AUTH_PROVIDER=local,
 * and the configuration refuses to start in production with it (docs/DECISIONES.md D-004).
 * Invitations and roles still apply, exactly like the real provider.
 */
export class LocalAuthProvider implements DirectAuthProvider {
  readonly kind = 'direct' as const;

  authenticate(email: string) {
    const trimmed = email.trim();
    return Promise.resolve(
      trimmed ? ok({ email: trimmed, name: null }) : err('invalid-credentials' as const),
    );
  }
}
