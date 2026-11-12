import type { AdminError } from '@application/use-cases/admin/shared';

export interface Flash {
  readonly kind: 'ok' | 'error';
  readonly text: string;
}

type ErrorCode = AdminError | 'invalid-request' | 'invalid-token';
type OkCode = 'invited' | 'role-changed' | 'deactivated' | 'reactivated';

const ERROR_TEXT: Readonly<Record<ErrorCode, string>> = {
  forbidden: 'No tienes permiso para esta acción.',
  'invalid-email': 'Usa un correo válido de @holafly.com.',
  'already-exists': 'Esa persona ya está en la lista.',
  'unknown-role': 'El rol elegido no existe.',
  'unknown-user': 'No encontramos a esa persona.',
  'confirmation-required': 'Para asignar el rol Líder marca la casilla de confirmación.',
  'unknown-permission': 'Ese permiso no existe.',
  'leader-only-permission': 'Ese permiso es solo para Líderes.',
  'leader-role-is-fixed': 'El rol Líder no se puede modificar.',
  'last-leader': 'Debe quedar al menos un Líder activo.',
  'self-demotion': 'No puedes quitarte a ti mismo el acceso de Líder.',
  'invalid-request': 'La solicitud no es válida. Inténtalo de nuevo.',
  'invalid-token': 'La sesión del formulario caducó. Recarga la página e inténtalo de nuevo.',
};

const OK_TEXT: Readonly<Record<OkCode, string>> = {
  invited: 'Invitación registrada. La persona podrá entrar con su correo de Holafly.',
  'role-changed': 'Rol actualizado.',
  deactivated: 'Persona dada de baja. Sus sesiones se cerraron.',
  reactivated: 'Persona reactivada. Podrá volver a entrar.',
};

export const REDIRECT_BASE = '/permisos';

export const okRedirect = (code: OkCode): string => `${REDIRECT_BASE}?ok=${code}`;

export const errorRedirect = (code: ErrorCode): string => `${REDIRECT_BASE}?error=${code}`;

/** Turns `?ok=` / `?error=` into a message. Unknown codes show nothing (no reflected text). */
export function flashFromQuery(params: URLSearchParams): Flash | null {
  const ok = params.get('ok');
  if (ok && Object.hasOwn(OK_TEXT, ok)) return { kind: 'ok', text: OK_TEXT[ok as OkCode] };
  const error = params.get('error');
  if (error && Object.hasOwn(ERROR_TEXT, error)) {
    return { kind: 'error', text: ERROR_TEXT[error as ErrorCode] };
  }
  return null;
}
