import type { Flash } from './admin-messages';
import { safeReturnPath } from './return-target';

export type SyncMessageCode =
  'started' | 'running' | 'wait' | 'unavailable' | 'invalid-request' | 'invalid-token';

const TEXT: Readonly<Record<SyncMessageCode, Flash>> = {
  started: {
    kind: 'ok',
    text: 'Pedimos la actualización a Jira. Recarga la página en unos segundos.',
  },
  running: { kind: 'ok', text: 'Ya hay una actualización en curso. Recarga en unos segundos.' },
  wait: { kind: 'error', text: 'Acabas de pedir una actualización. Espera un minuto.' },
  unavailable: {
    kind: 'error',
    text: 'No pudimos iniciar la actualización. Sigues viendo los últimos datos guardados.',
  },
  'invalid-request': { kind: 'error', text: 'La solicitud no es válida. Inténtalo de nuevo.' },
  'invalid-token': {
    kind: 'error',
    text: 'La sesión del formulario caducó. Recarga la página e inténtalo de nuevo.',
  },
};

export { safeReturnPath };

export const syncRedirect = (back: string, code: SyncMessageCode): string => `${back}?sync=${code}`;

/** Turns `?sync=` into a message. Unknown codes show nothing (no reflected text). */
export function syncFlashFromQuery(params: URLSearchParams): Flash | null {
  const code = params.get('sync');
  // hasOwn, not `in`: `?sync=toString` must not reach inherited object members.
  return code !== null && Object.hasOwn(TEXT, code) ? TEXT[code as SyncMessageCode] : null;
}
